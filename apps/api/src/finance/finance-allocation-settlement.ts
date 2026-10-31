import { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { assertCreditAdjustmentsSettled } from './finance-legacy-allocation-guard';

type Debit = { id: string; amount: Prisma.Decimal };

export async function lockBillingAccount(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  billingAccountId: string,
): Promise<void> {
  await transaction.$queryRaw`SELECT id FROM billing_accounts WHERE id = ${billingAccountId}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
}

/** All readers sum signed allocation events; historical allocations remain immutable. */
export async function allocateCreditToDebits(
  transaction: Prisma.TransactionClient,
  access: AccessContext,
  creditEntryId: string,
  maximumAmount: Prisma.Decimal,
  debits: Debit[],
): Promise<void> {
  const credit = await transaction.ledgerEntry.findFirstOrThrow({
    where: { organizationId: access.organizationId, id: creditEntryId, direction: 'CREDIT' },
  });
  await lockBillingAccount(transaction, access.organizationId, credit.billingAccountId);
  const [creditAllocation, debitAllocations] = await Promise.all([
    transaction.ledgerAllocation.aggregate({
      where: { organizationId: access.organizationId, creditEntryId },
      _sum: { amount: true },
    }),
    transaction.ledgerAllocation.groupBy({
      by: ['debitEntryId'],
      where: {
        organizationId: access.organizationId,
        debitEntryId: { in: debits.map(({ id }) => id) },
      },
      _sum: { amount: true },
    }),
  ]);
  let remaining = Prisma.Decimal.min(
    maximumAmount,
    credit.amount.sub(creditAllocation._sum.amount ?? 0),
  );
  const allocated = new Map(
    debitAllocations.map(({ debitEntryId, _sum }) => [debitEntryId, _sum.amount ?? 0]),
  );
  for (const debit of debits) {
    if (remaining.lte(0)) break;
    const available = debit.amount.sub(allocated.get(debit.id) ?? 0);
    if (available.lte(0)) continue;
    const amount = Prisma.Decimal.min(remaining, available);
    await transaction.ledgerAllocation.create({
      data: {
        organizationId: access.organizationId,
        creditEntryId,
        debitEntryId: debit.id,
        amount,
        createdBy: access.actorUserId,
      },
    });
    allocated.set(debit.id, new Prisma.Decimal(allocated.get(debit.id) ?? 0).add(amount));
    remaining = remaining.sub(amount);
  }
}

/** When activation creates receivables, apply existing credits without changing payment history. */
export async function settleEnrollmentPrepayments(
  transaction: Prisma.TransactionClient,
  access: AccessContext,
  billingAccountId: string,
  enrollmentId: string,
): Promise<void> {
  await lockBillingAccount(transaction, access.organizationId, billingAccountId);
  const [credits, debits] = await Promise.all([
    transaction.ledgerEntry.findMany({
      where: {
        organizationId: access.organizationId,
        billingAccountId,
        direction: 'CREDIT',
        OR: [{ enrollmentId }, { enrollmentId: null }],
      },
      orderBy: [{ postedAt: 'asc' }, { id: 'asc' }],
    }),
    transaction.ledgerEntry.findMany({
      where: {
        organizationId: access.organizationId,
        billingAccountId,
        enrollmentId,
        direction: 'DEBIT',
        entryType: { notIn: ['REFUND', 'PAYMENT_REVERSAL'] },
      },
      orderBy: [{ postedAt: 'asc' }, { id: 'asc' }],
    }),
  ]);
  for (const credit of credits) {
    await assertCreditAdjustmentsSettled(transaction, access.organizationId, credit.id);
    await allocateCreditToDebits(transaction, access, credit.id, credit.amount, debits);
  }
}
