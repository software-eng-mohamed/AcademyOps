import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { get, post } from './finance-http-client';
import type { FinanceHttpFixture } from './finance-http-fixture';
import type { HttpTestContext } from './http-test-harness';

type InvoiceResult = {
  id: string;
  status: string;
  version: number;
  serialNumber?: string | null;
};

export async function runFinanceDocumentsHttpStep(
  context: HttpTestContext,
  fixture: FinanceHttpFixture,
): Promise<void> {
  const debits = await Promise.all([
    seedInvoiceDebit(context, fixture, '75.00'),
    seedInvoiceDebit(context, fixture, '80.00'),
    seedInvoiceDebit(context, fixture, '90.00'),
  ]);
  const eligible = await get(
    context,
    `invoices/eligible-ledger-entries?billingAccountId=${fixture.billingAccountId}&enrollmentId=${fixture.enrollmentId}`,
  );
  assert.equal(eligible.status, 200, await eligible.clone().text());
  const eligibleIds = new Set(
    ((await eligible.json()) as { items: Array<{ id: string }> }).items.map(({ id }) => id),
  );
  assert.equal(
    debits.every((id) => eligibleIds.has(id)),
    true,
  );
  const primary = await createInvoice(context, fixture, debits[0], '75.00', true);
  const stale = await post(context, `invoices/${primary.id}/issue`, undefined, {
    'if-match': '9',
    'idempotency-key': `invoice-stale-${randomUUID()}`,
  });
  assert.equal(stale.status, 409);
  assert.equal(errorCode(await stale.json()), 'INVOICE_ISSUE_INVALID');
  const issued = await invoiceTransition(context, primary.id, 'issue', 1);
  assert.equal(issued.status, 'ISSUED');
  assert.equal(issued.version, 2);
  assert.ok(issued.serialNumber);
  const detail = await get(context, `invoices/${primary.id}`);
  assert.equal(detail.status, 200, await detail.clone().text());
  assert.equal(((await detail.json()) as InvoiceResult).status, 'ISSUED');
  const list = await get(
    context,
    `invoices?billingAccountId=${fixture.billingAccountId}&status=ISSUED`,
  );
  assert.equal(list.status, 200);
  assert.equal(
    ((await list.json()) as { items: Array<{ id: string }> }).items.some(
      ({ id }) => id === primary.id,
    ),
    true,
  );
  const credit = await post(
    context,
    `invoices/${primary.id}/credit-notes`,
    { amount: '15.00', reason: 'Approved invoice adjustment' },
    { 'idempotency-key': `credit-note-${randomUUID()}` },
  );
  assert.equal(credit.status, 201, await credit.clone().text());
  assert.equal(((await credit.json()) as { amount: string }).amount, '15.00');

  const voidable = await createInvoice(context, fixture, debits[1], '80.00');
  const voidableIssued = await invoiceTransition(context, voidable.id, 'issue', 1);
  const voided = await invoiceTransition(context, voidable.id, 'void', voidableIssued.version, {
    reason: 'Voided before settlement',
  });
  assert.equal(voided.status, 'VOIDED');

  const cancellable = await createInvoice(context, fixture, debits[2], '90.00');
  const cancelled = await invoiceTransition(context, cancellable.id, 'cancel', 1, {
    reason: 'Draft superseded before issue',
  });
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(
    await context.prisma.internalInvoice.count({
      where: { organizationId: context.organizationId },
    }),
    3,
  );
  assert.equal(
    await context.prisma.creditNote.count({
      where: { organizationId: context.organizationId, invoiceId: primary.id },
    }),
    1,
  );
}

async function createInvoice(
  context: HttpTestContext,
  fixture: FinanceHttpFixture,
  ledgerEntryId: string,
  amount: string,
  proveReplay = false,
): Promise<InvoiceResult> {
  const body = {
    billingAccountId: fixture.billingAccountId,
    lines: [
      {
        ledgerEntryId,
        descriptionAr: 'رسوم البرنامج',
        descriptionEn: 'Program charge',
        quantity: '1.00',
        unitAmount: amount,
      },
    ],
  };
  const key = `invoice-create-${randomUUID()}`;
  const response = await post(context, 'invoices', body, {
    'idempotency-key': key,
  });
  assert.equal(response.status, 201, await response.clone().text());
  const created = (await response.json()) as InvoiceResult;
  assert.equal(created.status, 'DRAFT');
  if (proveReplay) {
    const replay = await post(context, 'invoices', body, {
      'idempotency-key': key,
    });
    assert.equal(replay.status, 201);
    assert.deepEqual(await replay.json(), created);
  }
  return created;
}

async function invoiceTransition(
  context: HttpTestContext,
  invoiceId: string,
  action: 'issue' | 'cancel' | 'void',
  version: number,
  body?: unknown,
): Promise<InvoiceResult> {
  const response = await post(context, `invoices/${invoiceId}/${action}`, body, {
    'if-match': String(version),
    'idempotency-key': `invoice-${action}-${randomUUID()}`,
  });
  assert.equal(response.status, 201, await response.clone().text());
  return (await response.json()) as InvoiceResult;
}

async function seedInvoiceDebit(
  context: HttpTestContext,
  fixture: FinanceHttpFixture,
  amount: string,
): Promise<string> {
  const entry = await context.prisma.ledgerEntry.create({
    data: {
      organizationId: context.organizationId,
      billingAccountId: fixture.billingAccountId,
      enrollmentId: fixture.enrollmentId,
      direction: 'DEBIT',
      entryType: 'ADJUSTMENT',
      amount,
      sourceType: 'HTTP_INVOICE_TEST',
      sourceId: randomUUID(),
    },
  });
  return entry.id;
}

function errorCode(value: unknown): string | undefined {
  return (value as { code?: string }).code;
}
