import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlgMessagingClient } from '../src/messaging-client.js';
import {
  validateOtpChannelPairingCode,
  validateOtpChannelStatus,
} from '../src/messaging-validators.js';

const status = {
  id: '11111111-1111-4111-8111-111111111111',
  provider: 'BAILEYS',
  enabled: true,
  state: 'QR_REQUIRED',
  otpAvailable: false,
  needsQr: true,
  phoneMasked: '+20•••••7890',
  lastErrorCode: null,
  lastConnectedAt: null,
  lastDisconnectedAt: '2026-08-15T00:00:00.000Z',
  lastHeartbeatAt: null,
  qrExpiresAt: '2026-08-15T00:01:00.000Z',
  version: 2,
};

afterEach(() => vi.unstubAllGlobals());

describe('messaging API client', () => {
  it('validates status and short-lived pairing-code responses', () => {
    expect(validateOtpChannelStatus(status)).toEqual(status);
    expect(validateOtpChannelStatus({ ...status, phoneMasked: '***0280' })).toEqual({
      ...status,
      phoneMasked: '***0280',
    });
    expect(
      validateOtpChannelPairingCode({
        qr: 'a'.repeat(40),
        expiresAt: '2026-08-15T00:01:00.000Z',
      }),
    ).toEqual({ qr: 'a'.repeat(40), expiresAt: '2026-08-15T00:01:00.000Z' });
  });

  it('rejects impossible availability, QR, masking, and version combinations', () => {
    expectInvalid(() =>
      validateOtpChannelStatus({
        ...status,
        state: 'DISCONNECTED',
        otpAvailable: true,
      }),
    );
    expectInvalid(() => validateOtpChannelStatus({ ...status, enabled: false, needsQr: true }));
    expectInvalid(() => validateOtpChannelStatus({ ...status, phoneMasked: '+201234567890' }));
    expectInvalid(() => validateOtpChannelStatus({ ...status, id: null, version: 2 }));
  });

  it('sends CSRF, optimistic version, and idempotency headers for commands', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(status), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new PlgMessagingClient({
      baseUrl: 'https://academy.example.com/api/v1',
      getCsrfToken: () => 'csrf-a',
    });

    await client.commandOtpChannel('reset', 'Replace a broken session', 2, 'idem-reset-a');

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://academy.example.com/api/v1/messaging/otp-channel/reset',
    );
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(request.method).toBe('POST');
    expect(request.headers).toEqual(
      expect.objectContaining({
        'If-Match': '2',
        'idempotency-key': 'idem-reset-a',
        'x-csrf-token': 'csrf-a',
      }),
    );
    expect(JSON.parse(String(request.body))).toEqual({ reason: 'Replace a broken session' });
  });
});

function expectInvalid(operation: () => unknown): void {
  expect(operation).toThrow(
    expect.objectContaining({ payload: expect.objectContaining({ code: 'RESPONSE_INVALID' }) }),
  );
}
