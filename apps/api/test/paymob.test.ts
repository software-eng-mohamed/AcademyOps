import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaymobClient } from '../src/finance/paymob/paymob.client';
import {
  decryptPaymobSecret,
  egpToPiasters,
  encryptPaymobSecret,
  parsePaymobCallback,
  paymobHmacMessage,
  signPaymobCallback,
  verifyPaymobCallback,
} from '../src/finance/paymob/paymob';

const callback = parsePaymobCallback({
  type: 'TRANSACTION',
  obj: {
    amount_cents: 125050,
    created_at: '2026-08-09T12:00:00.000Z',
    currency: 'EGP',
    error_occured: false,
    has_parent_transaction: false,
    id: 90001,
    integration_id: 42,
    is_3d_secure: true,
    is_auth: false,
    is_capture: true,
    is_refunded: false,
    is_standalone_payment: true,
    is_voided: false,
    order: { id: 80001, merchant_order_id: 'PLG-attempt' },
    owner: 77,
    pending: false,
    source_data: { pan: '1234', sub_type: 'MasterCard', type: 'card' },
    success: true,
  },
});

describe('Paymob integration primitives', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('converts EGP to the smallest unit without floating-point arithmetic', () => {
    expect(egpToPiasters('1250.50')).toBe(125050);
    expect(egpToPiasters('1')).toBe(100);
    expect(() => egpToPiasters('1.001')).toThrow();
  });

  it('uses the exact official 20-field HMAC order and a timing-safe verifier', () => {
    expect(paymobHmacMessage(callback.obj)).toBe(
      '1250502026-08-09T12:00:00.000ZEGPfalsefalse9000142truefalsetruefalsetruefalse8000177false1234MasterCardcardtrue',
    );
    const signature = signPaymobCallback(callback.obj, 'test-hmac-secret');
    expect(verifyPaymobCallback(callback.obj, signature, 'test-hmac-secret')).toBe(true);
    expect(
      verifyPaymobCallback(callback.obj, `${signature.slice(0, -1)}0`, 'test-hmac-secret'),
    ).toBe(false);
  });

  it('encrypts the checkout client secret at rest', () => {
    const key = randomBytes(32).toString('base64');
    const encrypted = encryptPaymobSecret('client-secret', key);
    expect(encrypted).not.toContain('client-secret');
    expect(decryptPaymobSecret(encrypted, key)).toBe('client-secret');
    const parts = encrypted.split('.');
    parts[1] = Buffer.from(parts[1]!, 'base64url').subarray(0, 12).toString('base64url');
    expect(() => decryptPaymobSecret(parts.join('.'), key)).toThrow();
  });

  it('binds the opaque attempt id to the configured return URL', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: 4001, client_secret: 'sandbox-secret' }), {
          headers: { 'content-type': 'application/json' },
          status: 201,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new PaymobClient(
      new ConfigService({
        PAYMOB_BASE_URL: 'https://accept.paymob.com',
        PAYMOB_CHECKOUT_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
        PAYMOB_HMAC_SECRET: 'sandbox-hmac',
        PAYMOB_NOTIFICATION_URL: 'https://academy.example.com/api/v1/webhooks/paymob/transaction',
        PAYMOB_PAYMENT_METHOD_IDS: '42',
        PAYMOB_PUBLIC_KEY: 'sandbox-public',
        PAYMOB_REDIRECTION_URL: 'https://academy.example.com/en/payments/paymob/return',
        PAYMOB_SECRET_KEY: 'sandbox-secret-key',
      }),
    );

    await client.createIntention({
      amount: '4000.00',
      attemptId: '88888888-8888-4888-8888-888888888888',
      customer: {
        email: 'student@example.test',
        firstName: 'Test',
        lastName: 'Student',
        phone: '+201000000001',
      },
      installmentOrdinal: 1,
      reference: 'PLG-88888888-8888-4888-8888-888888888888',
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    if (typeof request.body !== 'string') throw new Error('Expected a JSON request body');
    const payload = JSON.parse(request.body) as { redirection_url: string };
    const returnUrl = new URL(payload.redirection_url);
    expect(returnUrl.origin + returnUrl.pathname).toBe(
      'https://academy.example.com/en/payments/paymob/return',
    );
    expect(returnUrl.searchParams.get('attempt')).toBe('88888888-8888-4888-8888-888888888888');
  });
});
