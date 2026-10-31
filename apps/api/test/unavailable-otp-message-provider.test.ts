import { describe, expect, it } from 'vitest';
import { UnavailableOtpMessageProvider } from '../src/messaging/unavailable-otp-message-provider';

describe('UnavailableOtpMessageProvider', () => {
  it('fails permanently without attempting a network delivery', async () => {
    const provider = new UnavailableOtpMessageProvider();

    await expect(
      provider.send({
        organizationId: 'org-a',
        to: '+201234567890',
        body: 'sensitive one-time code',
      }),
    ).rejects.toThrow('OTP_CONNECTOR_NOT_CONFIGURED');
  });
});
