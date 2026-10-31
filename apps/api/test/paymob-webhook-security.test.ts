import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PaymobWebhookService } from '../src/finance/paymob/paymob-webhook.service';
import { parsePaymobCallback, signPaymobCallback } from '../src/finance/paymob/paymob';
import type { PaymobClient } from '../src/finance/paymob/paymob.client';
import type { FinanceService } from '../src/finance/finance.service';
import type { AuditService } from '../src/platform/audit/audit.service';
import type { PrismaService } from '../src/platform/database/prisma.service';
import type { OutboxService } from '../src/platform/outbox/outbox.service';

const hmacSecret = 'test-hmac-secret';

function payload(overrides: Record<string, unknown> = {}) {
  return {
    type: 'TRANSACTION',
    obj: {
      amount_cents: 10000,
      created_at: '2026-08-12T00:00:00.000Z',
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
      order: { id: 80001, merchant_order_id: `PLG-${randomUUID()}` },
      owner: 77,
      pending: false,
      source_data: { pan: '1234', sub_type: 'MasterCard', type: 'card' },
      success: true,
      ...overrides,
    },
  };
}

function service(): PaymobWebhookService {
  const client = {
    configuration: () => ({ hmacSecret, paymentMethodIds: [42] }),
  } as PaymobClient;
  return new PaymobWebhookService(
    {} as PrismaService,
    client,
    {} as FinanceService,
    {} as AuditService,
    {} as OutboxService,
  );
}

describe('Paymob webhook boundary', () => {
  it.each([
    { id: null },
    { id: 'not-a-provider-id' },
    { order: { id: 1, merchant_order_id: 'PLG-x' } },
  ])('rejects signed but malformed provider identifiers', async (override) => {
    const body = payload(override);
    const signature = signPaymobCallback(parsePaymobCallback(body).obj, hmacSecret);
    await expect(service().handleWebhook(body, signature, 'correlation')).rejects.toMatchObject({
      response: { code: 'PAYMOB_WEBHOOK_INVALID' },
    });
  });

  it('rejects an invalid HMAC before database access', async () => {
    await expect(
      service().handleWebhook(payload(), '0'.repeat(128), 'correlation'),
    ).rejects.toMatchObject({ response: { code: 'PAYMOB_HMAC_INVALID' } });
  });
});
