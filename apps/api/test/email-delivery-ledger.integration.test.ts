import { createHash, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import { EmailDeliveryLedgerService } from '../src/worker/notifications/email-delivery-ledger.service';
import {
  PermanentEmailError,
  RetryableEmailError,
  type EmailMessage,
} from '../src/worker/notifications/email-provider';
import { SessionNotificationService } from '../src/worker/notifications/session-notification.service';
import type { SessionNotificationTargetService } from '../src/worker/notifications/session-notification-target.service';
import type { SessionNotificationBatch } from '../src/worker/notifications/session-notification.types';
import type { PrismaService } from '../src/platform/database/prisma.service';
import { UnrecoverableError } from 'bullmq';

const redisUrl = process.env.REDIS_URL;
const redisDescribe = redisUrl ? describe : describe.skip;

redisDescribe('email delivery ledger (Redis)', () => {
  it('suppresses confirmed duplicates without storing the business key', async () => {
    const ledger = new EmailDeliveryLedgerService(new ConfigService({ REDIS_URL: redisUrl }));
    const operation = vi.fn().mockResolvedValue('sent');
    const idempotencyKey = `message:${randomUUID()}:student@example.com`;
    const digest = createHash('sha256').update(idempotencyKey).digest('hex');
    const doneKey = `plg:email-delivery:v1:${digest}`;
    try {
      await expect(ledger.once(idempotencyKey, operation)).resolves.toBe('sent');
      await expect(ledger.once(idempotencyKey, operation)).resolves.toBe('sent');
      expect(operation).toHaveBeenCalledOnce();

      const redis = new IORedis(redisUrl!);
      const keys = await redis.keys('plg:email-delivery:v1:*');
      expect(keys).toContain(doneKey);
      expect(keys.join('|')).not.toContain('student@example.com');
      await redis.quit();
    } finally {
      await ledger.onModuleDestroy();
      const cleanup = new IORedis(redisUrl!);
      await cleanup.del(doneKey, `${doneKey}:lock`);
      await cleanup.quit();
    }
  });

  it('continues past rejected recipients and retries only transient deliveries across worker instances', async () => {
    const configuration = new ConfigService({ REDIS_URL: redisUrl });
    const ledger = new EmailDeliveryLedgerService(configuration);
    const replayLedger = new EmailDeliveryLedgerService(configuration);
    const batch: SessionNotificationBatch = {
      eventId: randomUUID(),
      organizationId: randomUUID(),
      studentPersonIds: [],
      eventKeyByUser: new Map(),
      payload: {
        v: 1,
        sessionId: randomUUID(),
        type: 'CANCELLED',
        startsAt: null,
        endsAt: null,
        cohort: { id: randomUUID(), code: 'C01', name: null },
        room: null,
      },
      recipients: Array.from({ length: 7 }, (_, index) => ({
        userId: `user-${index}`,
        personId: `person-${index}`,
        locale: 'en',
        email: `student-${index}@example.com`,
      })),
    };
    const attempts = new Map<string, number>();
    const delivery = vi.fn((message: EmailMessage) => {
      const attempt = (attempts.get(message.to) ?? 0) + 1;
      attempts.set(message.to, attempt);
      if (message.to === 'student-0@example.com')
        return Promise.reject(new PermanentEmailError('rejected'));
      if (message.to === 'student-1@example.com' && attempt === 1)
        return Promise.reject(new RetryableEmailError('retry'));
      return Promise.resolve('sent' as const);
    });
    const service = (currentLedger: EmailDeliveryLedgerService) =>
      new SessionNotificationService({} as PrismaService, {} as SessionNotificationTargetService, {
        send: (message) => currentLedger.once(message.idempotencyKey, () => delivery(message)),
      });
    const doneKeys = batch.recipients.map(
      ({ userId }) =>
        `plg:email-delivery:v1:${createHash('sha256')
          .update(`plg-session-${batch.eventId}-${userId}`)
          .digest('hex')}`,
    );
    const redis = new IORedis(redisUrl!);
    try {
      await expect(service(ledger).deliverEmails(batch)).rejects.toBeInstanceOf(
        RetryableEmailError,
      );
      expect(delivery).toHaveBeenCalledTimes(7);
      expect(await redis.get(doneKeys[0]!)).toBe('permanent');
      expect(await redis.get(doneKeys[1]!)).toBeNull();
      expect(await redis.get(doneKeys[6]!)).toBe('1');

      await expect(service(replayLedger).deliverEmails(batch)).rejects.toBeInstanceOf(
        UnrecoverableError,
      );
      expect(delivery).toHaveBeenCalledTimes(8);
      expect(attempts.get('student-0@example.com')).toBe(1);
      expect(attempts.get('student-1@example.com')).toBe(2);
      expect(attempts.get('student-6@example.com')).toBe(1);
      expect(await redis.get(doneKeys[1]!)).toBe('1');
    } finally {
      await ledger.onModuleDestroy();
      await replayLedger.onModuleDestroy();
      await redis.del(...doneKeys.flatMap((key) => [key, `${key}:lock`]));
      await redis.quit();
    }
  });
});
