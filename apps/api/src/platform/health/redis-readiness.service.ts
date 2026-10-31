import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type IORedis from 'ioredis';

export const REDIS_READINESS_CLIENT_FACTORY = Symbol('REDIS_READINESS_CLIENT_FACTORY');
export type RedisReadinessClientFactory = () => IORedis;
const probeTimeoutMs = 1_500;

@Injectable()
export class RedisReadinessService {
  constructor(
    @Inject(REDIS_READINESS_CLIENT_FACTORY)
    private readonly createClient: RedisReadinessClientFactory,
  ) {}

  async check(): Promise<void> {
    const client = this.createClient();
    client.on('error', () => undefined);
    try {
      const pong = await withTimeout(
        (async () => {
          await client.connect();
          return client.ping();
        })(),
        probeTimeoutMs,
      );
      if (pong !== 'PONG') throw new Error('Unexpected Redis ping response');
    } catch {
      throw new ServiceUnavailableException({
        code: 'REDIS_NOT_READY',
        messageKey: 'health.redisNotReady',
      });
    } finally {
      client.disconnect(false);
    }
  }
}

async function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Redis readiness probe timed out')), timeoutMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
