import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PaymobClient } from '../../src/finance/paymob/paymob.client';
import { signPaymobCallback, type PaymobTransaction } from '../../src/finance/paymob/paymob';
import { setupStudentAPricingAndLedger } from '../postgres/student-fixture-helper';
import { runHttpScenario, type HttpTestContext } from './http-test-harness';
const hmacSecret = 'a'.repeat(64);
const paymentMethodId = 5504163;
export async function runPaymobHttpScenario(): Promise<void> {
  let intentionCalls = 0;
  const fakeClient = {
    configuration: () => ({
      baseUrl: 'https://accept.paymob.com',
      secretKey: 'sandbox-secret',
      publicKey: 'sandbox-public',
      hmacSecret,
      paymentMethodIds: [paymentMethodId],
      notificationUrl: 'https://academy.example.test/api/v1/webhooks/paymob/transaction',
      redirectionUrl: 'https://academy.example.test/ar/payments/paymob/return',
      encryptionKey: Buffer.alloc(32, 7).toString('base64'),
    }),
    createIntention: () => {
      intentionCalls += 1;
      return Promise.resolve({
        intentionId: 'sandbox-intention-1',
        clientSecret: 'sandbox-client-secret',
        checkoutUrl: 'https://accept.paymob.com/unifiedcheckout/?synthetic=1',
      });
    },
  };
  await runHttpScenario(
    {
      permissions: ['payments.checkout'],
      overrides: [{ token: PaymobClient, value: fakeClient }],
    },
    async (context) => {
      const fixture = await seedPaymobFixture(context);
      const checkoutHeaders = {
        ...context.unsafeHeaders,
        'idempotency-key': 'http-paymob-checkout-1',
      };
      const checkoutPath = `/api/v1/installments/${fixture.installmentId}/paymob-checkout`;
      const first = await fetch(context.baseUrl + checkoutPath, {
        method: 'POST',
        headers: checkoutHeaders,
      });
      assert.equal(first.status, 201, await first.clone().text());
      const checkout = (await first.json()) as {
        attemptId: string;
        status: string;
      };
      assert.equal(checkout.status, 'PENDING');
      const replay = await fetch(context.baseUrl + checkoutPath, {
        method: 'POST',
        headers: checkoutHeaders,
      });
      assert.equal(replay.status, 201);
      const replayBody = (await replay.json()) as {
        attemptId: string;
      };
      assert.equal(replayBody.attemptId, checkout.attemptId);
      assert.equal(intentionCalls, 1);
      const attempt = await context.prisma.paymentGatewayAttempt.findUniqueOrThrow({
        where: { id: checkout.attemptId },
      });
      const succeeded = callback(attempt.internalReference, attempt.amount.mul(100).toNumber(), {
        id: 900001,
        success: true,
      });
      const accepted = await sendWebhook(context, succeeded);
      assert.equal(accepted.status, 201);
      const acceptedBody = (await accepted.json()) as Record<string, unknown>;
      assert.deepEqual(pick(acceptedBody, ['accepted', 'duplicate', 'status']), {
        accepted: true,
        duplicate: false,
        status: 'SUCCEEDED',
      });
      const duplicate = await sendWebhook(context, succeeded);
      assert.equal(duplicate.status, 201);
      const duplicateBody = (await duplicate.json()) as Record<string, unknown>;
      assert.deepEqual(pick(duplicateBody, ['accepted', 'duplicate', 'status']), {
        accepted: true,
        duplicate: true,
        status: 'SUCCEEDED',
      });
      const lateFailure = callback(attempt.internalReference, attempt.amount.mul(100).toNumber(), {
        id: 900002,
        success: false,
      });
      const ignoredFailure = await sendWebhook(context, lateFailure);
      assert.equal(ignoredFailure.status, 201);
      const failureBody = (await ignoredFailure.json()) as {
        status: string;
      };
      assert.equal(failureBody.status, 'SUCCEEDED');
      assert.equal(
        await context.prisma.payment.count({
          where: { organizationId: context.organizationId, status: 'POSTED' },
        }),
        1,
      );
      assert.equal(
        await context.prisma.paymentGatewayEvent.count({
          where: { organizationId: context.organizationId },
        }),
        2,
      );
    },
  );
}
async function seedPaymobFixture(context: HttpTestContext) {
  const database = context.prisma;
  await database.studentProfile.create({
    data: { organizationId: context.organizationId, personId: context.personId },
  });
  await database.personContact.createMany({
    data: [
      {
        organizationId: context.organizationId,
        personId: context.personId,
        type: 'EMAIL',
        rawValue: 'student@example.test',
        normalizedValue: 'student@example.test',
        isPrimary: true,
        verifiedAt: new Date(),
      },
      {
        organizationId: context.organizationId,
        personId: context.personId,
        type: 'PHONE',
        rawValue: '+201001234567',
        normalizedValue: '+201001234567',
        isPrimary: true,
        verifiedAt: new Date(),
      },
    ],
  });
  const billing = await database.billingAccount.create({
    data: {
      organizationId: context.organizationId,
      kind: 'INDIVIDUAL',
      personId: context.personId,
    },
  });
  const program = await database.program.create({
    data: {
      organizationId: context.organizationId,
      code: 'PAYMOB-PROGRAM',
      name: 'Program',
    },
  });
  const version = await database.programVersion.create({
    data: { organizationId: context.organizationId, programId: program.id, version: 1 },
  });
  const module = await database.academicModule.create({
    data: {
      organizationId: context.organizationId,
      code: 'PAYMOB-MODULE',
      name: 'Module',
    },
  });
  await database.programVersionModule.create({
    data: {
      organizationId: context.organizationId,
      programVersionId: version.id,
      moduleId: module.id,
      ordinal: 1,
    },
  });
  await database.programVersion.update({
    where: { id: version.id },
    data: { status: 'PUBLISHED', effectiveFrom: new Date('2026-01-01') },
  });
  const enrollment = await database.enrollment.create({
    data: {
      organizationId: context.organizationId,
      studentPersonId: context.personId,
      programVersionId: version.id,
      billingAccountId: billing.id,
      homeBranchId: context.branchId,
    },
  });
  const { inst1 } = await setupStudentAPricingAndLedger(
    database,
    context.organizationId,
    enrollment.id,
    context.userId,
    billing.id,
  );
  await database.paymentMethod.create({
    data: {
      organizationId: context.organizationId,
      code: 'PAYMOB',
      name: 'Paymob',
      verificationRequired: false,
    },
  });
  return { installmentId: inst1.id };
}
function callback(
  reference: string,
  amountCents: number,
  state: {
    id: number;
    success: boolean;
  },
): PaymobTransaction {
  return {
    amount_cents: amountCents,
    created_at: '2026-08-15T12:00:00Z',
    currency: 'EGP',
    error_occured: !state.success,
    has_parent_transaction: false,
    id: state.id,
    integration_id: paymentMethodId,
    is_3d_secure: true,
    is_auth: false,
    is_capture: false,
    is_refunded: false,
    is_standalone_payment: true,
    is_voided: false,
    owner: 1,
    pending: false,
    success: state.success,
    order: { id: 700001, merchant_order_id: reference },
    source_data: { pan: '2345', sub_type: 'MasterCard', type: 'card' },
  };
}
async function sendWebhook(context: HttpTestContext, transaction: PaymobTransaction) {
  const hmac = signPaymobCallback(transaction, hmacSecret);
  return fetch(`${context.baseUrl}/api/v1/webhooks/paymob/transaction?hmac=${hmac}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-correlation-id': randomUUID() },
    body: JSON.stringify({ type: 'TRANSACTION', obj: transaction }),
  });
}
function pick(value: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}
