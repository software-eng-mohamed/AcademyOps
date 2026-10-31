import { afterAll, expect, it } from 'vitest';
import { createTestHarness } from './harness';
import { financialMeta, setupFinanceLifecycle } from './finance-lifecycle-fixture';

const harness = createTestHarness();
harness.databaseDescribe('Financial lifecycle settlement regressions', () => {
  afterAll(() => harness.prisma.$disconnect());

  it('reopens a reversed installment, preserves history, and accepts a replacement payment once', () =>
    harness.inRollbackTransaction(async (transaction) => {
      const f = await setupFinanceLifecycle(transaction);
      const payment = await f.pay();
      await f.assertDebt('0.00');
      const posted = await transaction.payment.findUniqueOrThrow({ where: { id: payment.id } });
      const original = await transaction.ledgerAllocation.findMany({
        where: { creditEntryId: posted.ledgerEntryId! },
      });
      expect(original).toHaveLength(1);
      expect(await f.reverse(payment.id)).toMatchObject({ status: 'REVERSED' });
      await f.assertDebt('100.00');
      expect(
        await transaction.ledgerAllocation.findUnique({ where: { id: original[0]!.id } }),
      ).toEqual(original[0]);
      const entries = await transaction.ledgerEntry.findMany({
        where: { enrollmentId: f.enrollmentId },
      });
      expect(entries.filter((entry) => entry.entryType === 'PAYMENT_REVERSAL')).toHaveLength(1);
      await f.pay();
      await f.assertDebt('0.00');
      const installment = (await f.reads.listInstallments(f.maker, f.enrollmentId, { limit: 10 }))
        .items[0];
      expect(installment).toMatchObject({ allocatedAmount: '100.00', state: 'PAID' });
    }));

  it('reopens only a partial refund amount and consumes the original credit against the refund', () =>
    harness.inRollbackTransaction(async (transaction) => {
      const f = await setupFinanceLifecycle(transaction);
      const payment = await f.pay();
      const request = await f.refunds.requestRefund(
        f.maker,
        payment.id,
        '30.00',
        'Partial',
        financialMeta(),
      );
      const meta = financialMeta();
      const refund = await f.refunds.approveRefund(f.checker, request.id, meta);
      expect(await f.refunds.approveRefund(f.checker, request.id, meta)).toEqual(refund);
      await f.assertDebt('30.00');
      const record = await transaction.refund.findUniqueOrThrow({ where: { id: refund.id } });
      const consumed = await transaction.ledgerAllocation.aggregate({
        where: { debitEntryId: record.ledgerEntryId },
        _sum: { amount: true },
      });
      expect(consumed._sum.amount?.toFixed(2)).toBe('30.00');
      expect(await transaction.refund.count({ where: { paymentId: payment.id } })).toBe(1);
      await f.pay('30.00');
      await f.assertDebt('0.00');
    }));

  it('uses unapplied credit first and releases only the balance from paid installments', () =>
    harness.inRollbackTransaction(async (transaction) => {
      const f = await setupFinanceLifecycle(transaction);
      const payment = await f.pay('150.00');
      await f.assertDebt('0.00', '50.00');
      await f.refund(payment.id, '20.00');
      await f.assertDebt('0.00', '30.00');
      await f.refund(payment.id, '50.00');
      await f.assertDebt('20.00');
      const posted = await transaction.payment.findUniqueOrThrow({ where: { id: payment.id } });
      const releases = await transaction.ledgerAllocation.findMany({
        where: { creditEntryId: posted.ledgerEntryId!, amount: { lt: 0 } },
      });
      expect(releases.reduce((sum, allocation) => sum + Number(allocation.amount), 0)).toBe(-20);
      await f.pay('20.00');
      await f.assertDebt('0.00');
    }));

  it('allocates a prepayment when activation posts the installment debit', () =>
    harness.inRollbackTransaction(async (transaction) => {
      const f = await setupFinanceLifecycle(transaction, false);
      await f.pay('60.00');
      expect(await f.balances.enrollmentSummary(f.maker, f.enrollmentId)).toMatchObject({
        balance: '-60.00',
        outstandingDebits: '0.00',
        unappliedCredits: '60.00',
      });
      expect(await f.activate()).toMatchObject({ state: 'ACTIVE' });
      await f.assertDebt('40.00');
      await f.pay('40.00');
      await f.assertDebt('0.00');
    }));

  it('does not reapply a reversed prepayment during later activation', () =>
    harness.inRollbackTransaction(async (transaction) => {
      const f = await setupFinanceLifecycle(transaction, false);
      const payment = await f.pay('60.00');
      await f.reverse(payment.id);
      expect(await f.balances.enrollmentSummary(f.maker, f.enrollmentId)).toMatchObject({
        balance: '0.00',
        outstandingDebits: '0.00',
        unappliedCredits: '0.00',
      });
      await f.activate();
      await f.assertDebt('100.00');
      await f.pay();
      await f.assertDebt('0.00');
    }));

  for (const entryType of ['PAYMENT_REVERSAL', 'REFUND'] as const) {
    it(`blocks activation from spending a historic unsettled ${entryType} credit`, () =>
      harness.inRollbackTransaction(async (transaction) => {
        const f = await setupFinanceLifecycle(transaction, false);
        const payment = await f.pay('60.00');
        const posted = await transaction.payment.findUniqueOrThrow({ where: { id: payment.id } });
        const request =
          entryType === 'REFUND'
            ? await f.refunds.requestRefund(
                f.maker,
                payment.id,
                '10.00',
                'Historic refund',
                financialMeta(),
              )
            : await f.reversals.requestReversal(
                f.maker,
                payment.id,
                'Historic reversal',
                financialMeta(),
              );
        const adjustment = await transaction.ledgerEntry.create({
          data: {
            organizationId: f.organizationId,
            billingAccountId: f.billingAccountId,
            enrollmentId: f.enrollmentId,
            direction: 'DEBIT',
            entryType,
            amount: entryType === 'REFUND' ? '10.00' : '60.00',
            sourceType: entryType === 'REFUND' ? 'REFUND_REQUEST' : 'PAYMENT_REVERSAL_REQUEST',
            sourceId: request.id,
            ...(entryType === 'PAYMENT_REVERSAL' ? { reversalOfId: posted.ledgerEntryId } : {}),
          },
        });
        // Reproduce old posted adjustments without allocations, preserving that history.
        if (entryType === 'REFUND') {
          await transaction.refund.create({
            data: {
              organizationId: f.organizationId,
              paymentId: payment.id,
              refundRequestId: request.id,
              ledgerEntryId: adjustment.id,
              amount: '10.00',
              processedBy: f.checker.actorUserId,
            },
          });
        } else {
          await transaction.payment.update({
            where: { id: payment.id },
            data: { status: 'REVERSED', version: { increment: 1 } },
          });
        }
        const before = await f.balances.enrollmentSummary(f.maker, f.enrollmentId);
        await expect(f.activate()).rejects.toMatchObject({
          response: { code: 'FINANCE_ALLOCATION_RECONCILIATION_REQUIRED' },
        });
        expect(await f.balances.enrollmentSummary(f.maker, f.enrollmentId)).toEqual(before);
        expect(
          await transaction.enrollment.findUnique({ where: { id: f.enrollmentId } }),
        ).toMatchObject({ state: 'DRAFT' });
        expect(
          await transaction.installment.findUnique({ where: { id: f.installment.id } }),
        ).toMatchObject({ debitEntryId: null });
      }));
  }
});
