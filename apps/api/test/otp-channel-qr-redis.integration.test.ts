import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { OtpChannelQrService } from '../src/messaging/otp-channel-qr.service';

const redisDescribe = process.env.REDIS_URL ? describe : describe.skip;

redisDescribe('OTP channel QR Redis lifecycle', () => {
  it('connects lazily before the first write and round-trips an encrypted QR', async () => {
    const encryptionKey = Buffer.alloc(32, 23).toString('base64');
    const config = {
      getOrThrow: () => process.env.REDIS_URL,
      get: () => encryptionKey,
    } as unknown as ConfigService;
    const service = new OtpChannelQrService(config);
    const organizationId = randomUUID();
    const qr = `test-pairing-qr-${randomUUID()}`;
    const expiresAt = new Date(Date.now() + 60_000);

    try {
      await service.write(organizationId, qr, expiresAt);
      const stored = await service.read(organizationId);
      expect(stored?.qr).toBe(qr);
      expect(stored?.expiresAt).toBe(expiresAt.toISOString());
      await service.clear(organizationId);
      expect(await service.read(organizationId)).toBeNull();
    } finally {
      await service.clear(organizationId).catch(() => undefined);
      await service.onModuleDestroy();
    }
  });
});
