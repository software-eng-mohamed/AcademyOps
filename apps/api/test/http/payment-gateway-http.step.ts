import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { get } from './finance-http-client';
import type { FinanceHttpFixture } from './finance-http-fixture';
import type { HttpTestContext } from './http-test-harness';

export async function proveGatewayAttemptRead(
  context: HttpTestContext,
  fixture: FinanceHttpFixture,
  installmentId: string,
): Promise<void> {
  const attempt = await context.prisma.paymentGatewayAttempt.create({
    data: {
      organizationId: context.organizationId,
      installmentId,
      enrollmentId: fixture.enrollmentId,
      billingAccountId: fixture.billingAccountId,
      status: 'PENDING',
      internalReference: `HTTP-GATEWAY-${randomUUID()}`,
      amount: '120.00',
      idempotencyKey: `http-gateway-${randomUUID()}`,
      createdBy: context.userId,
    },
  });
  const response = await get(context, `payment-gateway-attempts/${attempt.id}`);
  assert.equal(response.status, 200, await response.clone().text());
  const body = (await response.json()) as {
    attemptId: string;
    status: string;
    amount: string;
    currencyCode: string;
    paymentId: string | null;
    updatedAt: string;
  };
  assert.equal(body.attemptId, attempt.id);
  assert.equal(body.status, 'PENDING');
  assert.equal(body.amount, '120.00');
  assert.equal(body.currencyCode, 'EGP');
  assert.equal(body.paymentId, null);
  assert.equal(Number.isNaN(Date.parse(body.updatedAt)), false);
}
