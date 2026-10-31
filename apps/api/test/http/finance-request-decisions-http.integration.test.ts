import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { runHttpScenario } from './http-test-harness';
import { post } from './finance-http-client';
import { seedFinanceHttpFixture } from './finance-http-fixture';

const databaseDescribe = process.env.DATABASE_URL ? describe : describe.skip;
const headers = () => ({ 'idempotency-key': randomUUID() });

databaseDescribe('finance request decisions through authenticated HTTP and PostgreSQL', () => {
  it.each(['REFUND', 'REVERSAL'] as const)(
    '%s enforces actor, status, retry and tenant boundaries',
    async (kind) => {
      await runHttpScenario(
        {
          permissions: [
            'payments.read',
            'refunds.request',
            'refunds.approve',
            'payments.reverse.request',
            'payments.reverse.approve',
          ],
          roleCode: 'OWNER',
        },
        async (context) => {
          const fixture = await seedFinanceHttpFixture(context);
          const payment = await context.prisma.payment.create({
            data: {
              organizationId: context.organizationId,
              billingAccountId: fixture.billingAccountId,
              enrollmentId: fixture.enrollmentId,
              methodId: fixture.cashMethodId,
              status: 'POSTED',
              amount: '100.00',
              receivedAt: new Date(),
              postedAt: new Date(),
              createdBy: context.userId,
              idempotencyKey: randomUUID(),
            },
          });
          const prefix = kind === 'REFUND' ? 'refund-requests' : 'payment-reversal-requests';
          const requestPath = `payments/${payment.id}/${kind === 'REFUND' ? 'refund-requests' : 'reversal-requests'}`;
          const makeRequest = async () => {
            const response = await post(
              context,
              requestPath,
              { reason: 'Original request', ...(kind === 'REFUND' ? { amount: '100.00' } : {}) },
              headers(),
            );
            expect(response.status, await response.clone().text()).toBe(201);
            return (await response.json()) as { id: string };
          };
          const own = await makeRequest();
          const ownRejection = await post(
            context,
            `${prefix}/${own.id}/reject`,
            { reason: 'Maker cannot reject' },
            headers(),
          );
          expect(ownRejection.status).toBe(409);
          expect(await ownRejection.json()).toMatchObject({ code: 'MAKER_CHECKER_REQUIRED' });
          const blank = await post(
            context,
            `${prefix}/${own.id}/withdraw`,
            { reason: '   ' },
            headers(),
          );
          expect(blank.status).toBe(400);
          const missingKey = await post(context, `${prefix}/${own.id}/withdraw`, {
            reason: 'No retry key',
          });
          expect(missingKey.status).toBe(400);
          const retry = headers();
          for (const key of [retry, retry, headers()]) {
            const response = await post(
              context,
              `${prefix}/${own.id}/withdraw`,
              { reason: 'Entered by mistake' },
              key,
            );
            expect(response.status, await response.clone().text()).toBe(200);
            expect(await response.json()).toEqual({ id: own.id, status: 'WITHDRAWN' });
          }
          const changedReason = await post(
            context,
            `${prefix}/${own.id}/withdraw`,
            { reason: 'Different reason' },
            retry,
          );
          expect(changedReason.status).toBe(409);
          expect(await changedReason.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
          // A full-amount replacement proves a closed refund releases the reservation;
          // for reversal this proves the pending-request unique index is also released.
          const replacement = await makeRequest();
          if (kind === 'REFUND')
            await context.prisma.refundRequest.update({
              where: { id: replacement.id },
              data: { requestedBy: fixture.otherUserId },
            });
          else
            await context.prisma.paymentReversalRequest.update({
              where: { id: replacement.id },
              data: { requestedBy: fixture.otherUserId },
            });
          const otherWithdrawal = await post(
            context,
            `${prefix}/${replacement.id}/withdraw`,
            { reason: 'Not the requester' },
            headers(),
          );
          expect(otherWithdrawal.status).toBe(403);
          const reject = await post(
            context,
            `${prefix}/${replacement.id}/reject`,
            { reason: 'Checked and rejected' },
            headers(),
          );
          expect(reject.status, await reject.clone().text()).toBe(200);
          expect(await reject.json()).toEqual({ id: replacement.id, status: 'REJECTED' });
          const approveClosed = await post(
            context,
            `${prefix}/${replacement.id}/approve`,
            undefined,
            headers(),
          );
          expect(approveClosed.status).toBe(409);
          const stored =
            kind === 'REFUND'
              ? await context.prisma.refundRequest.findUniqueOrThrow({
                  where: { id: replacement.id },
                })
              : await context.prisma.paymentReversalRequest.findUniqueOrThrow({
                  where: { id: replacement.id },
                });
          expect(stored).toMatchObject({
            status: 'REJECTED',
            decidedBy: context.userId,
            decisionReason: 'Checked and rejected',
            decidedAt: expect.any(Date) as unknown,
          });
          expect(
            await context.prisma.auditEvent.count({
              where: {
                entityId: own.id,
                action: kind === 'REFUND' ? 'refund.withdraw' : 'payment.reversal.withdraw',
              },
            }),
          ).toBe(1);
          expect(
            await context.prisma.ledgerEntry.count({
              where: { organizationId: context.organizationId },
            }),
          ).toBe(0);
          expect(
            await context.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }),
          ).toMatchObject({ status: 'POSTED', version: 1 });
          const foreignPayment = await context.prisma.payment.findUniqueOrThrow({
            where: { id: fixture.foreignPaymentId },
          });
          const foreignData = {
            organizationId: foreignPayment.organizationId,
            paymentId: foreignPayment.id,
            requestedBy: foreignPayment.createdBy,
            reason: 'Foreign request',
          };
          const foreign =
            kind === 'REFUND'
              ? await context.prisma.refundRequest.create({
                  data: { ...foreignData, requestedAmount: '1.00' },
                })
              : await context.prisma.paymentReversalRequest.create({ data: foreignData });
          const foreignDecision = await post(
            context,
            `${prefix}/${foreign.id}/reject`,
            { reason: 'Must stay hidden' },
            headers(),
          );
          expect(foreignDecision.status).toBe(404);
        },
      );
    },
    120_000,
  );

  it('requires endpoint permissions even for a valid session', async () => {
    await runHttpScenario(
      { permissions: ['payments.read'], roleCode: 'FINANCE_VIEWER' },
      async (context) => {
        for (const prefix of ['refund-requests', 'payment-reversal-requests']) {
          for (const action of ['reject', 'withdraw']) {
            const response = await post(
              context,
              `${prefix}/${randomUUID()}/${action}`,
              { reason: 'Unauthorized decision' },
              headers(),
            );
            expect(response.status).toBe(403);
            expect(await response.json()).toMatchObject({ code: 'PERMISSION_DENIED' });
          }
        }
      },
    );
  }, 120_000);
});
