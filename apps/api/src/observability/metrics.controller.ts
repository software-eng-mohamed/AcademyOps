import { timingSafeEqual } from 'node:crypto';
import { Controller, Get, Headers, NotFoundException, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../iam/authorization/decorators';
import { RateLimit } from '../platform/rate-limit/rate-limit.decorator';
import { ApiMetricsService } from './api-metrics.service';

export const INTERNAL_METRICS_ROUTE = 'internal/metrics';

@Controller({ path: INTERNAL_METRICS_ROUTE, version: '1' })
export class MetricsController {
  constructor(
    private readonly metrics: ApiMetricsService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @Public()
  @RateLimit({ name: 'internal.metrics', limit: 120, windowSeconds: 60 })
  @ApiExcludeEndpoint()
  async scrape(
    @Headers('authorization') authorization: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const token = this.config.get<string>('METRICS_TOKEN');
    if (!token || !safeBearer(authorization, token)) {
      throw new NotFoundException({ code: 'NOT_FOUND', messageKey: 'errors.notFound' });
    }
    response.type(this.metrics.contentType());
    return this.metrics.render();
  }
}

function safeBearer(authorization: string | undefined, expectedToken: string): boolean {
  if (!authorization?.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(expectedToken);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
