import { ConflictException } from '@nestjs/common';
import { afterAll, expect, it } from 'vitest';
import { createTestHarness } from './harness';
import { financialMeta, setupFinanceLifecycle } from './finance-lifecycle-fixture';

const harness = createTestHarness();
harness.databaseDescribe('Financial lifecycle request and immutability guards', () => {
  afterAll(() => harness.prisma.$disconnect());

  it('blocks reversal while a refund is pending without posting any correction', () =>
    harness.inRollbackTransaction(async (transaction) => {
      const f = await setupFinanceLifecycle(transaction);
      const payment = await f.pay();
      await f.refunds.requestRefund(f.maker, payment.id, '10.00', 'Pending', financialMeta());
      await expect(
        f.reversals.requestReversal(f.maker, payment.id, 'Invalid', financialMeta()),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(
        await transaction.paymentReversalRequest.count({ where: { paymentId: payment.id } }),
      ).toBe(0);
      await f.assertDebt('0.00');
    }));

  it('blocks reversal after a processed refund without double debiting the student', () =>
    harness.inRollbackTransaction(async (transaction) => {
      const f = await setupFinanceLifecycle(transaction);
      const payment = await f.pay();
      await f.refund(payment.id, '10.00');
      await expect(
        f.reversals.requestReversal(f.maker, payment.id, 'Invalid', financialMeta()),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(
        await transaction.ledgerEntry.count({
          where: { enrollmentId: f.enrollmentId, entryType: 'PAYMENT_REVERSAL' },
        }),
      ).toBe(0);
      await f.assertDebt('10.00');
    }));

  it('blocks refund while reversal is pending and allows that reversal to complete', () =>
    harness.inRollbackTransaction(async (transaction) => {
      const f = await setupFinanceLifecycle(transaction);
      const payment = await f.pay();
      const request = await f.reversals.requestReversal(
        f.maker,
        payment.id,
        'Pending',
        financialMeta(),
      );
      await expect(
        f.refunds.requestRefund(f.maker, payment.id, '10.00', 'Invalid', financialMeta()),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(await transaction.refundRequest.count({ where: { paymentId: payment.id } })).toBe(0);
      await f.reversals.approveReversal(f.checker, request.id, financialMeta());
      await f.assertDebt('100.00');
    }));

  it('keeps original allocations immutable after releasing them', () =>
    harness.inRollbackTransaction(async (transaction) => {
      const f = await setupFinanceLifecycle(transaction);
      const payment = await f.pay();
      const posted = await transaction.payment.findUniqueOrThrow({ where: { id: payment.id } });
      const original = await transaction.ledgerAllocation.findFirstOrThrow({
        where: { creditEntryId: posted.ledgerEntryId! },
      });
      await f.refund(payment.id, '30.00');
      await harness.expectDatabaseRejection(transaction, () =>
        transaction.ledgerAllocation.update({
          where: { id: original.id },
          data: { amount: '70.00' },
        }),
      );
      await harness.expectDatabaseRejection(transaction, () =>
        transaction.ledgerAllocation.delete({
          where: { id: original.id },
        }),
      );
      expect(await transaction.ledgerAllocation.findUnique({ where: { id: original.id } })).toEqual(
        original,
      );
      await f.assertDebt('30.00');
    }));

  it('rejects releasing more than the original allocation and releasing against unrelated debits', () =>
    harness.inRollbackTransaction(async (transaction) => {
      const f = await setupFinanceLifecycle(transaction);
      const payment = await f.pay();
      const posted = await transaction.payment.findUniqueOrThrow({ where: { id: payment.id } });
      const original = await transaction.ledgerAllocation.findFirstOrThrow({
        where: { creditEntryId: posted.ledgerEntryId! },
      });
      const refund = await f.refund(payment.id, '30.00');
      const correction = await transaction.refund.findUniqueOrThrow({ where: { id: refund.id } });
      const release = (amount: string, debitEntryId = original.debitEntryId) =>
        transaction.ledgerAllocation.create({
          data: {
            organizationId: f.organizationId,
            creditEntryId: original.creditEntryId,
            debitEntryId,
            amount,
            reversalOfAllocationId: original.id,
            adjustmentEntryId: correction.ledgerEntryId,
            createdBy: f.checker.actorUserId,
          },
        });
      // EGP 30 has already been released; another 71 exceeds the original 100.
      await harness.expectDatabaseRejection(transaction, () => release('-71.00'));
      await harness.expectDatabaseRejection(transaction, () =>
        release('-1.00', correction.ledgerEntryId),
      );
      await f.assertDebt('30.00');
    }));

  it('requires releases and settlement to commit together and forbids using another payment credit', () =>
    harness.inRollbackTransaction(async (transaction) => {
      const f = await setupFinanceLifecycle(transaction);
      const payment = await f.pay();
      const otherPayment = await f.pay('10.00');
      const posted = await transaction.payment.findUniqueOrThrow({ where: { id: payment.id } });
      const other = await transaction.payment.findUniqueOrThrow({ where: { id: otherPayment.id } });
      const original = await transaction.ledgerAllocation.findFirstOrThrow({
        where: { creditEntryId: posted.ledgerEntryId! },
      });
      const request = await f.refunds.requestRefund(
        f.maker,
        payment.id,
        '30.00',
        'Pending',
        financialMeta(),
      );
      await harness.expectDatabaseRejection(transaction, async () => {
        const adjustment = await transaction.ledgerEntry.create({
          data: {
            organizationId: f.organizationId,
            billingAccountId: f.billingAccountId,
            enrollmentId: f.enrollmentId,
            direction: 'DEBIT',
            entryType: 'REFUND',
            amount: '30.00',
            sourceType: 'REFUND_REQUEST',
            sourceId: request.id,
          },
        });
        await transaction.ledgerAllocation.create({
          data: {
            organizationId: f.organizationId,
            creditEntryId: original.creditEntryId,
            debitEntryId: original.debitEntryId,
            amount: '-30.00',
            reversalOfAllocationId: original.id,
            adjustmentEntryId: adjustment.id,
            createdBy: f.checker.actorUserId,
          },
        });
        // Simulate commit checks before the surrounding test intentionally rolls back.
        await transaction.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
      });
      await harness.expectDatabaseRejection(transaction, async () => {
        const adjustment = await transaction.ledgerEntry.create({
          data: {
            organizationId: f.organizationId,
            billingAccountId: f.billingAccountId,
            enrollmentId: f.enrollmentId,
            direction: 'DEBIT',
            entryType: 'REFUND',
            amount: '30.00',
            sourceType: 'REFUND_REQUEST',
            sourceId: request.id,
          },
        });
        await transaction.ledgerAllocation.create({
          data: {
            organizationId: f.organizationId,
            creditEntryId: other.ledgerEntryId!,
            debitEntryId: adjustment.id,
            amount: '10.00',
            createdBy: f.checker.actorUserId,
          },
        });
      });
      await f.assertDebt('0.00', '10.00');
    }));
});
