import { ServiceUnavailableException } from '@nestjs/common';
import type IORedis from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import { HealthController } from '../src/platform/health/health.controller';
import { RedisReadinessService } from '../src/platform/health/redis-readiness.service';
import type { PrismaService } from '../src/platform/database/prisma.service';

describe('health readiness', () => {
  it('requires successful Postgres and Redis probes and closes the probe connection', async () => {
    const client = redisClient({ ping: vi.fn().mockResolvedValue('PONG') });
    const redis = new RedisReadinessService(() => client as unknown as IORedis);
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]) };
    const controller = new HealthController(prisma as unknown as PrismaService, redis);

    await expect(controller.ready()).resolves.toEqual({ status: 'ok' });
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
    expect(client.connect).toHaveBeenCalledOnce();
    expect(client.ping).toHaveBeenCalledOnce();
    expect(client.disconnect).toHaveBeenCalledWith(false);
  });

  it('fails readiness with 503 and closes the client when Redis is unavailable', async () => {
    const client = redisClient({ ping: vi.fn().mockRejectedValue(new Error('offline')) });
    const service = new RedisReadinessService(() => client as unknown as IORedis);

    await expect(service.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.check()).rejects.toMatchObject({
      response: { code: 'REDIS_NOT_READY', messageKey: 'health.redisNotReady' },
    });
    expect(client.disconnect).toHaveBeenCalledTimes(2);
  });
});

function redisClient(overrides: { ping: ReturnType<typeof vi.fn> }) {
  return {
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    ...overrides,
  };
}
