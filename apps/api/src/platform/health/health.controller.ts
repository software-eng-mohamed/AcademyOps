import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../database/prisma.service';
import { Public } from '../../iam/authorization/decorators';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { RedisReadinessService } from './redis-readiness.service';

@ApiTags('platform')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisReadinessService,
  ) {}

  @Get('live')
  @Public()
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @Public()
  @RateLimit({ name: 'health.ready', limit: 120, windowSeconds: 60 })
  async ready(): Promise<{ status: 'ok' }> {
    await this.prisma.$queryRaw`SELECT 1`;
    await this.redis.check();
    return { status: 'ok' };
  }
}
