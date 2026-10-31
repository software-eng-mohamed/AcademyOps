import { createHash, randomUUID } from 'node:crypto';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import type { EmailDeliveryResult } from './email-provider';
import { PermanentEmailError, RetryableEmailError } from './email-provider';

@Injectable()
export class EmailDeliveryLedgerService implements OnModuleDestroy {
  private readonly redis: IORedis;

  constructor(config: ConfigService) {
    this.redis = new IORedis(config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: 1,
    });
  }

  async once(
    idempotencyKey: string,
    operation: () => Promise<EmailDeliveryResult>,
  ): Promise<EmailDeliveryResult> {
    const digest = createHash('sha256').update(idempotencyKey).digest('hex');
    const doneKey = `plg:email-delivery:v1:${digest}`;
    const lockKey = `${doneKey}:lock`;
    const token = randomUUID();
    if (this.isTerminal(await this.call(() => this.redis.get(doneKey)))) return 'sent';
    const acquired = await this.call(() => this.redis.set(lockKey, token, 'PX', 30_000, 'NX'));
    if (acquired !== 'OK') throw new RetryableEmailError('EMAIL_DELIVERY_BUSY');
    try {
      if (this.isTerminal(await this.call(() => this.redis.get(doneKey)))) return 'sent';
      let result: EmailDeliveryResult;
      try {
        result = await operation();
      } catch (error) {
        if (error instanceof PermanentEmailError) {
          await this.call(() => this.redis.set(doneKey, 'permanent', 'EX', 30 * 24 * 60 * 60));
        }
        throw error;
      }
      if (result === 'sent') {
        await this.call(() => this.redis.set(doneKey, '1', 'EX', 30 * 24 * 60 * 60));
      }
      return result;
    } finally {
      await this.release(lockKey, token);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis.status !== 'end') await this.redis.quit();
  }

  private isTerminal(state: string | null): boolean {
    if (state === 'permanent') throw new PermanentEmailError('EMAIL_DELIVERY_PREVIOUSLY_REJECTED');
    return state === '1';
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
      // A short lock TTL bounds recovery when Redis becomes unavailable.
    }
  }

  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch {
      throw new RetryableEmailError('EMAIL_DELIVERY_LEDGER_UNAVAILABLE');
    }
  }
}
