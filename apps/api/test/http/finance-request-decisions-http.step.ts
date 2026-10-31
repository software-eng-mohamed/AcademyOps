import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { post } from './finance-http-client';
import type { FinanceHttpFixture } from './finance-http-fixture';
import type { HttpTestContext } from './http-test-harness';

// Executed inside the release finance child so route evidence comes from real
// successful requests, in addition to the standalone decision boundary tests.
export async function runFinanceRequestDecisionsHttpStep(
  context: HttpTestContext,
  fixture: FinanceHttpFixture,
): Promise<void> {
  const headers = () => ({ 'idempotency-key': randomUUID() });
  const response = await post(
    context,
    'payments',
    {
      billingAccountId: fixture.billingAccountId,
      enrollmentId: fixture.enrollmentId,
      methodId: fixture.cashMethodId,
      amount: '10.00',
      receivedAt: new Date().toISOString(),
    },
    headers(),
  );
  assert.equal(response.status, 201, await response.clone().text());
  const payment = (await response.json()) as { id: string };
  for (const kind of ['REFUND', 'REVERSAL'] as const) {
    const requestPath = `payments/${payment.id}/${kind === 'REFUND' ? 'refund-requests' : 'reversal-requests'}`;
    const decisionPath = kind === 'REFUND' ? 'refund-requests' : 'payment-reversal-requests';
    for (const decision of ['withdraw', 'reject'] as const) {
      const requested = await post(
        context,
        requestPath,
        {
          reason: 'Release verification request',
          ...(kind === 'REFUND' ? { amount: '1.00' } : {}),
        },
        headers(),
      );
      assert.equal(requested.status, 201, await requested.clone().text());
      const request = (await requested.json()) as { id: string };
      if (decision === 'reject') {
        // The existing fixture contains a separate maker; the authenticated actor is the checker.
        const input = { where: { id: request.id }, data: { requestedBy: fixture.otherUserId } };
        if (kind === 'REFUND') await context.prisma.refundRequest.update(input);
        else await context.prisma.paymentReversalRequest.update(input);
      }
      const decided = await post(
        context,
        `${decisionPath}/${request.id}/${decision}`,
        {
          reason: 'Release verification decision',
        },
        headers(),
      );
      assert.equal(decided.status, 200, await decided.clone().text());
      assert.deepEqual(await decided.json(), {
        id: request.id,
        status: decision === 'withdraw' ? 'WITHDRAWN' : 'REJECTED',
      });
    }
  }
}
