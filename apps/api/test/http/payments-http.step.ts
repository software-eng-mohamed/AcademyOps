import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { get, post } from './finance-http-client';
import type { FinanceHttpFixture } from './finance-http-fixture';
import type { HttpTestContext } from './http-test-harness';
import { proveGatewayAttemptRead } from './payment-gateway-http.step';

type PaymentResult = {
  id: string;
  status: string;
  version: number;
  receiptSerial: string | null;
};

export type PaymentHttpEvidence = {
  postedPaymentId: string;
  receiptId: string;
};

export async function runPaymentsHttpStep(
  context: HttpTestContext,
  fixture: FinanceHttpFixture,
  scheduleId: string,
): Promise<PaymentHttpEvidence> {
  const installmentId = await activateInstallmentDebit(context, fixture, scheduleId);
  const pending = await createPayment(context, fixture, {
    methodId: fixture.transferMethodId,
    amount: '120.00',
    externalReference: `HTTP-POST-${randomUUID()}`,
  });
  assert.equal(pending.status, 'PENDING_VERIFICATION');
  const stale = await post(context, `payments/${pending.id}/post`, undefined, {
    'if-match': '99',
    'idempotency-key': `payment-post-stale-${randomUUID()}`,
  });
  assert.equal(stale.status, 409);
  assert.equal(errorCode(await stale.json()), 'VERSION_CONFLICT');
  const postKey = `payment-post-${randomUUID()}`;
  const postedResponse = await post(context, `payments/${pending.id}/post`, undefined, {
    'if-match': '1',
    'idempotency-key': postKey,
  });
  assert.equal(postedResponse.status, 201, await postedResponse.clone().text());
  const posted = (await postedResponse.json()) as PaymentResult;
  assert.equal(posted.status, 'POSTED');
  assert.equal(posted.version, 2);
  assert.ok(posted.receiptSerial);
  const postReplay = await post(context, `payments/${pending.id}/post`, undefined, {
    'if-match': '1',
    'idempotency-key': postKey,
  });
  assert.equal(postReplay.status, 201);
  assert.deepEqual(await postReplay.json(), posted);
  const issuedReceipt = await post(context, `payments/${posted.id}/receipt`, undefined, {
    'idempotency-key': `receipt-issue-${randomUUID()}`,
  });
  assert.equal(issuedReceipt.status, 201, await issuedReceipt.clone().text());
  assert.equal(((await issuedReceipt.json()) as { paymentId: string }).paymentId, posted.id);
  await proveGatewayAttemptRead(context, fixture, installmentId);

  const rejectedPending = await createPayment(context, fixture, {
    methodId: fixture.transferMethodId,
    amount: '25.00',
    externalReference: `HTTP-REJECT-${randomUUID()}`,
  });
  const rejectedResponse = await post(
    context,
    `payments/${rejectedPending.id}/reject`,
    { reason: 'Reference could not be verified' },
    { 'if-match': '1', 'idempotency-key': `payment-reject-${randomUUID()}` },
  );
  assert.equal(rejectedResponse.status, 201, await rejectedResponse.clone().text());
  assert.equal(((await rejectedResponse.json()) as PaymentResult).status, 'REJECTED');

  const refundable = await createPayment(context, fixture, {
    methodId: fixture.cashMethodId,
    amount: '100.00',
  });
  assert.equal(refundable.status, 'POSTED');
  await proveRefundLifecycle(context, fixture, refundable.id);
  const reversible = await createPayment(context, fixture, {
    methodId: fixture.cashMethodId,
    amount: '30.00',
  });
  await proveReversalLifecycle(context, fixture, reversible.id);

  const receipt = await context.prisma.internalReceipt.findFirstOrThrow({
    where: { organizationId: context.organizationId, paymentId: posted.id },
  });
  await proveFinanceReads(context, fixture, posted.id, receipt.id);
  await assertLedgerInvariants(context, fixture);
  return { postedPaymentId: posted.id, receiptId: receipt.id };
}

async function createPayment(
  context: HttpTestContext,
  fixture: FinanceHttpFixture,
  input: { methodId: string; amount: string; externalReference?: string },
): Promise<PaymentResult> {
  const response = await post(
    context,
    'payments',
    {
      billingAccountId: fixture.billingAccountId,
      enrollmentId: fixture.enrollmentId,
      receivedAt: new Date().toISOString(),
      ...input,
    },
    { 'idempotency-key': `payment-create-${randomUUID()}` },
  );
  assert.equal(response.status, 201, await response.clone().text());
  return (await response.json()) as PaymentResult;
}

async function proveRefundLifecycle(
  context: HttpTestContext,
  fixture: FinanceHttpFixture,
  paymentId: string,
): Promise<void> {
  const excessive = await post(
    context,
    `payments/${paymentId}/refund-requests`,
    { amount: '100.01', reason: 'Must never exceed the settled payment' },
    { 'idempotency-key': `refund-excess-${randomUUID()}` },
  );
  assert.equal(excessive.status, 409);
  assert.equal(errorCode(await excessive.json()), 'REFUND_AMOUNT_EXCEEDS_AVAILABLE');
  const requested = await post(
    context,
    `payments/${paymentId}/refund-requests`,
    { amount: '20.00', reason: 'Student withdrew from one activity' },
    { 'idempotency-key': `refund-request-${randomUUID()}` },
  );
  assert.equal(requested.status, 201, await requested.clone().text());
  const ownRequest = (await requested.json()) as { id: string; status: string };
  assert.equal(ownRequest.status, 'REQUESTED');
  const makerChecker = await post(context, `refund-requests/${ownRequest.id}/approve`, undefined, {
    'idempotency-key': `refund-own-${randomUUID()}`,
  });
  assert.equal(makerChecker.status, 409);
  assert.equal(errorCode(await makerChecker.json()), 'MAKER_CHECKER_REQUIRED');
  await context.prisma.refundRequest.update({
    where: { id: ownRequest.id },
    data: { requestedBy: fixture.otherUserId, requestedAmount: '100.01' },
  });
  const unsafeApproval = await post(
    context,
    `refund-requests/${ownRequest.id}/approve`,
    undefined,
    { 'idempotency-key': `refund-unsafe-approval-${randomUUID()}` },
  );
  assert.equal(unsafeApproval.status, 409);
  assert.equal(errorCode(await unsafeApproval.json()), 'REFUND_AMOUNT_EXCEEDS_AVAILABLE');
  await context.prisma.refundRequest.update({
    where: { id: ownRequest.id },
    data: { requestedAmount: '10.00' },
  });
  const approved = await post(context, `refund-requests/${ownRequest.id}/approve`, undefined, {
    'idempotency-key': `refund-approve-${randomUUID()}`,
  });
  assert.equal(approved.status, 201, await approved.clone().text());
  assert.equal(((await approved.json()) as { amount: string }).amount, '10.00');
}

async function proveReversalLifecycle(
  context: HttpTestContext,
  fixture: FinanceHttpFixture,
  paymentId: string,
): Promise<void> {
  const requested = await post(
    context,
    `payments/${paymentId}/reversal-requests`,
    { reason: 'Operator requested a controlled reversal' },
    { 'idempotency-key': `reversal-request-${randomUUID()}` },
  );
  assert.equal(requested.status, 201, await requested.clone().text());
  const ownRequest = (await requested.json()) as { id: string };
  const denied = await post(
    context,
    `payment-reversal-requests/${ownRequest.id}/approve`,
    undefined,
    { 'idempotency-key': `reversal-own-${randomUUID()}` },
  );
  assert.equal(denied.status, 409);
  assert.equal(errorCode(await denied.json()), 'MAKER_CHECKER_REQUIRED');
  await context.prisma.paymentReversalRequest.update({
    where: { id: ownRequest.id },
    data: { requestedBy: fixture.otherUserId },
  });
  const approved = await post(
    context,
    `payment-reversal-requests/${ownRequest.id}/approve`,
    undefined,
    { 'idempotency-key': `reversal-approve-${randomUUID()}` },
  );
  assert.equal(approved.status, 201, await approved.clone().text());
  assert.equal(((await approved.json()) as PaymentResult).status, 'REVERSED');
}

async function proveFinanceReads(
  context: HttpTestContext,
  fixture: FinanceHttpFixture,
  paymentId: string,
  receiptId: string,
): Promise<void> {
  for (const path of [
    'payment-methods',
    `payments?enrollmentId=${fixture.enrollmentId}`,
    'payments/method-mix',
    `payments/${paymentId}`,
    `receipts?billingAccountId=${fixture.billingAccountId}`,
    `receipts/${receiptId}`,
    `billing-accounts/${fixture.billingAccountId}/finance-summary`,
    `enrollments/${fixture.enrollmentId}/finance-summary`,
    `finance/reports/aging?branchId=${context.branchId}`,
    `enrollments/${fixture.enrollmentId}/installments`,
  ]) {
    const response = await get(context, path);
    assert.equal(response.status, 200, `${path}: ${await response.clone().text()}`);
  }
  const hidden = await get(context, `payments/${fixture.foreignPaymentId}`);
  assert.equal(hidden.status, 404);
}

async function activateInstallmentDebit(
  context: HttpTestContext,
  fixture: FinanceHttpFixture,
  scheduleId: string,
): Promise<string> {
  const installment = await context.prisma.installment.findFirstOrThrow({
    where: { organizationId: context.organizationId, scheduleId },
    orderBy: { ordinal: 'asc' },
  });
  const debit = await context.prisma.ledgerEntry.create({
    data: {
      organizationId: context.organizationId,
      billingAccountId: fixture.billingAccountId,
      enrollmentId: fixture.enrollmentId,
      direction: 'DEBIT',
      entryType: 'INSTALLMENT',
      amount: installment.amount,
      sourceType: 'INSTALLMENT',
      sourceId: installment.id,
    },
  });
  await context.prisma.installment.update({
    where: { id: installment.id },
    data: { debitEntryId: debit.id },
  });
  return installment.id;
}

async function assertLedgerInvariants(
  context: HttpTestContext,
  fixture: FinanceHttpFixture,
): Promise<void> {
  const payments = await context.prisma.payment.findMany({
    where: {
      organizationId: context.organizationId,
      enrollmentId: fixture.enrollmentId,
    },
  });
  assert.equal(payments.filter(({ status }) => status === 'POSTED').length, 2);
  assert.equal(payments.filter(({ status }) => status === 'REVERSED').length, 1);
  assert.equal(payments.filter(({ status }) => status === 'REJECTED').length, 1);
  assert.equal(
    payments.every(({ amount }) => amount.gt(0)),
    true,
  );
  assert.equal(
    await context.prisma.internalReceipt.count({
      where: {
        organizationId: context.organizationId,
        paymentId: { in: payments.map(({ id }) => id) },
      },
    }),
    3,
  );
  const refund = await context.prisma.refund.findFirstOrThrow({
    where: { organizationId: context.organizationId },
  });
  assert.equal(refund.amount.toFixed(2), '10.00');
  assert.equal(
    await context.prisma.ledgerEntry.count({
      where: {
        organizationId: context.organizationId,
        entryType: 'PAYMENT_REVERSAL',
      },
    }),
    1,
  );
}

function errorCode(value: unknown): string | undefined {
  return (value as { code?: string }).code;
}
