import { randomUUID } from 'node:crypto';
import { Injectable, OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';

export class RetryableSecurityDeliveryError extends Error {}

@Injectable()
export class SecurityDeliveryLedgerService implements OnModuleInit, OnModuleDestroy {
  private readonly redis: IORedis;

  constructor(config: ConfigService) {
    this.redis = new IORedis(config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.redis.connect();
    await this.redis.ping();
  }

  async once(
    eventId: string,
    channel: 'email' | 'whatsapp',
    operation: () => Promise<'sent' | 'disabled'>,
  ): Promise<'sent' | 'disabled' | 'duplicate'> {
    const doneKey = `plg:security-delivery:v1:${channel}:${eventId}`;
    const lockKey = `${doneKey}:lock`;
    const token = randomUUID();
    if (await this.redisCall(() => this.redis.get(doneKey))) return 'duplicate';
    const acquired = await this.redisCall(() => this.redis.set(lockKey, token, 'PX', 30_000, 'NX'));
    if (acquired !== 'OK') {
      throw new RetryableSecurityDeliveryError('SECURITY_DELIVERY_BUSY');
    }
    try {
      if (await this.redisCall(() => this.redis.get(doneKey))) return 'duplicate';
      const result = await operation();
      if (result === 'sent') {
        await this.redisCall(() => this.redis.set(doneKey, '1', 'EX', 7 * 24 * 60 * 60));
      }
      return result;
    } finally {
      await this.release(lockKey, token);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis.status === 'ready') await this.redis.quit();
    else this.redis.disconnect();
  }

  private async release(key: string, token: string): Promise<void> {
    try {
      await this.redis.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        key,
        token,
      );
    } catch {
      // Completion is already durable or the job will retry through BullMQ.
    }
  }

  private async redisCall<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch {
      throw new RetryableSecurityDeliveryError('SECURITY_DELIVERY_LEDGER_UNAVAILABLE');
    }
  }
}
