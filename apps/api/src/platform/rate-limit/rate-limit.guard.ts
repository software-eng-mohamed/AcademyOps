import type { CanActivate, ExecutionContext, OnModuleDestroy } from '@nestjs/common';
import { HttpException, HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import IORedis from 'ioredis';
import type { AuthenticatedRequest } from '../../iam/authorization/decorators';
import { RATE_LIMIT, type RateLimitRule } from './rate-limit.decorator';
import { rateLimitBuckets } from './rate-limit-key';

const incrementScript = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return { count, redis.call('TTL', KEYS[1]) }
`;

type RequestWithBody = Omit<AuthenticatedRequest, 'body'> & {
  body?: unknown;
  query?: unknown;
};

@Injectable()
export class RateLimitGuard implements CanActivate, OnModuleDestroy {
  private readonly redis: IORedis;
  private readonly pepper: string;

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService,
  ) {
    this.pepper = config.getOrThrow<string>('SESSION_PEPPER');
    this.redis = new IORedis(config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    this.redis.on('error', () => undefined);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rule = this.reflector.getAllAndOverride<RateLimitRule>(RATE_LIMIT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rule) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithBody>();
    const response = http.getResponse<Response>();
    const buckets = rateLimitBuckets(rule, request, this.pepper);
    try {
      for (const bucket of buckets) {
        const result = (await this.redis.eval(
          incrementScript,
          1,
          bucket.key,
          rule.windowSeconds,
        )) as [number, number];
        const count = Number(result[0]);
        const ttl = Math.max(1, Number(result[1]));
        response.setHeader('RateLimit-Limit', bucket.limit.toString());
        response.setHeader('RateLimit-Remaining', Math.max(0, bucket.limit - count).toString());
        response.setHeader('RateLimit-Reset', ttl.toString());
        if (count > bucket.limit) {
          response.setHeader('Retry-After', ttl.toString());
          throw new HttpException(
            {
              code: 'RATE_LIMIT_EXCEEDED',
              messageKey: 'security.rateLimitExceeded',
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException({
        code: 'RATE_LIMIT_UNAVAILABLE',
        messageKey: 'security.rateLimitUnavailable',
      });
    }
    return true;
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
