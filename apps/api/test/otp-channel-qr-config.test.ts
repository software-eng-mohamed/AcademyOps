import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { OtpChannelQrService } from '../src/messaging/otp-channel-qr.service';

describe('OTP channel QR configuration', () => {
  it('boots without a local encryption key and fails QR use closed', async () => {
    const config = {
      getOrThrow: () => 'redis://127.0.0.1:1',
      get: () => undefined,
    } as unknown as ConfigService;
    const service = new OtpChannelQrService(config);

    try {
      await service.write('00000000-0000-4000-8000-000000000001', 'x'.repeat(20), new Date());
      throw new Error('Expected missing QR encryption key rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as ServiceUnavailableException).getResponse()).toEqual({
        code: 'OTP_CHANNEL_QR_NOT_CONFIGURED',
        messageKey: 'messaging.qrNotConfigured',
      });
    } finally {
      await service.onModuleDestroy();
    }
  });
});
