import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { allocateCreditToDebits, lockBillingAccount } from './finance-allocation-settlement';

/** Consume the refunded/reversed credit against its adjustment debit, reopening original debts. */
export async function settlePaymentAdjustment(
  transaction: Prisma.TransactionClient,
  access: AccessContext,
  creditEntryId: string,
  adjustment: { id: string; amount: Prisma.Decimal; billingAccountId: string },
): Promise<void> {
  await lockBillingAccount(transaction, access.organizationId, adjustment.billingAccountId);
  const credit = await transaction.ledgerEntry.findFirstOrThrow({
    where: { id: creditEntryId, organizationId: access.organizationId, direction: 'CREDIT' },
  });
  const allocations = await transaction.ledgerAllocation.findMany({
    where: { organizationId: access.organizationId, creditEntryId },
    orderBy: [{ allocatedAt: 'desc' }, { id: 'desc' }],
  });
  const netAllocated = allocations.reduce((sum, row) => sum.add(row.amount), new Prisma.Decimal(0));
  let release = Prisma.Decimal.max(adjustment.amount.sub(credit.amount.sub(netAllocated)), 0);
  const adjustments = await transaction.ledgerEntry.findMany({
    where: {
      organizationId: access.organizationId,
      id: { in: allocations.map(({ debitEntryId }) => debitEntryId) },
      entryType: { in: ['REFUND', 'PAYMENT_REVERSAL'] },
    },
    select: { id: true },
  });
  const adjustmentIds = new Set(adjustments.map(({ id }) => id));
  for (const allocation of allocations) {
    if (release.lte(0)) break;
    if (allocation.amount.lte(0) || adjustmentIds.has(allocation.debitEntryId)) continue;
    const released = allocations
      .filter((row) => row.reversalOfAllocationId === allocation.id)
      .reduce((sum, row) => sum.sub(row.amount), new Prisma.Decimal(0));
    const available = allocation.amount.sub(released);
    if (available.lte(0)) continue;
    const amount = Prisma.Decimal.min(release, available);
    await transaction.ledgerAllocation.create({
      data: {
        organizationId: access.organizationId,
        creditEntryId,
        debitEntryId: allocation.debitEntryId,
        amount: amount.negated(),
        reversalOfAllocationId: allocation.id,
        adjustmentEntryId: adjustment.id,
        createdBy: access.actorUserId,
      },
    });
    release = release.sub(amount);
  }
  if (release.gt(0)) {
    throw new ConflictException({
      code: 'PAYMENT_ADJUSTMENT_ALLOCATION_CONFLICT',
      messageKey: 'finance.paymentAdjustmentAllocationConflict',
    });
  }
  await allocateCreditToDebits(transaction, access, creditEntryId, adjustment.amount, [adjustment]);
}

export async function assertNoRefundForReversal(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  paymentId: string,
): Promise<void> {
  const [refund, pending] = await Promise.all([
    transaction.refund.findFirst({ where: { organizationId, paymentId }, select: { id: true } }),
    transaction.refundRequest.findFirst({
      where: { organizationId, paymentId, status: 'REQUESTED' },
      select: { id: true },
    }),
  ]);
  if (refund || pending) throw adjustmentConflict();
}

export async function assertNoPendingReversal(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  paymentId: string,
): Promise<void> {
  const pending = await transaction.paymentReversalRequest.findFirst({
    where: { organizationId, paymentId, status: 'REQUESTED' },
    select: { id: true },
  });
  if (pending) throw adjustmentConflict();
}

function adjustmentConflict(): ConflictException {
  return new ConflictException({
    code: 'PAYMENT_ADJUSTMENT_CONFLICT',
    messageKey: 'finance.paymentAdjustmentConflict',
  });
}
