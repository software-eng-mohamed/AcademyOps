import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PermanentOtpDeliveryError,
  RetryableOtpDeliveryError,
} from '../src/messaging/otp-message-provider';
import { WhatsappWebOtpMessageProvider } from '../src/messaging/whatsapp-web-otp-message-provider';

const message = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  to: '+201001234567',
  body: 'Your verification code is 123456',
  idempotencyKey: '22222222-2222-4222-8222-222222222222',
};

afterEach(() => vi.unstubAllGlobals());

describe('WhatsappWebOtpMessageProvider', () => {
  it('sends a bounded authenticated request to the private connector', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"status":"sent"}'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(provider().send(message)).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url).toEqual(new URL('http://otp-connector:3002/internal/send'));
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual(
      expect.objectContaining({ authorization: `Bearer ${'a'.repeat(64)}` }),
    );
    expect(init.body).toBe(JSON.stringify(message));
  });

  it('classifies invalid recipients as permanent and outages as retryable', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 422 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = provider();
    await expect(service.send(message)).rejects.toBeInstanceOf(PermanentOtpDeliveryError);
    await expect(service.send(message)).rejects.toBeInstanceOf(RetryableOtpDeliveryError);
  });

  it('fails permanently when the connector is not configured', async () => {
    const service = new WhatsappWebOtpMessageProvider(
      new ConfigService({
        OTP_CONNECTOR_URL: null,
        OTP_CONNECTOR_INTERNAL_TOKEN: null,
      }),
    );
    await expect(service.send(message)).rejects.toBeInstanceOf(PermanentOtpDeliveryError);
  });
});

function provider(): WhatsappWebOtpMessageProvider {
  return new WhatsappWebOtpMessageProvider(
    new ConfigService({
      OTP_CONNECTOR_URL: 'http://otp-connector:3002',
      OTP_CONNECTOR_INTERNAL_TOKEN: 'a'.repeat(64),
    }),
  );
}
