import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import { SecurityDeliveryLedgerService } from '../src/worker/security/security-delivery-ledger.service';

const redisUrl = process.env.REDIS_URL;
const redisDescribe = redisUrl ? describe : describe.skip;

redisDescribe('security delivery ledger (Redis)', () => {
  it('suppresses a confirmed duplicate event and does not persist disabled delivery', async () => {
    const ledger = new SecurityDeliveryLedgerService(new ConfigService({ REDIS_URL: redisUrl }));
    const delivered = vi.fn().mockResolvedValue('sent');
    const disabled = vi.fn().mockResolvedValue('disabled');
    const sentEvent = randomUUID();
    const disabledEvent = randomUUID();
    try {
      await ledger.onModuleInit();
      await expect(ledger.once(sentEvent, 'whatsapp', delivered)).resolves.toBe('sent');
      await expect(ledger.once(sentEvent, 'whatsapp', delivered)).resolves.toBe('duplicate');
      expect(delivered).toHaveBeenCalledOnce();
      await expect(ledger.once(disabledEvent, 'email', disabled)).resolves.toBe('disabled');
      await expect(ledger.once(disabledEvent, 'email', disabled)).resolves.toBe('disabled');
      expect(disabled).toHaveBeenCalledTimes(2);
    } finally {
      await ledger.onModuleDestroy();
      const cleanup = new IORedis(redisUrl!);
      const keys = [sentEvent, disabledEvent].flatMap((eventId) => [
        `plg:security-delivery:v1:whatsapp:${eventId}`,
        `plg:security-delivery:v1:whatsapp:${eventId}:lock`,
        `plg:security-delivery:v1:email:${eventId}`,
        `plg:security-delivery:v1:email:${eventId}:lock`,
      ]);
      await cleanup.del(...keys);
      await cleanup.quit();
    }
  });
});
