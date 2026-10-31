import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

export async function assertCompatiblePayment(
  db: Prisma.TransactionClient,
  organizationId: string,
  enrollmentId: string,
  billingAccountId: string,
  debitEntryId: string,
  payment: {
    id: string;
    enrollmentId: string | null;
    billingAccountId: string;
    ledgerEntryId: string | null;
    methodId: string;
    status: string;
    amount: Prisma.Decimal;
    receivedAt: Date;
  },
  expectedMethodId: string,
  expectedAmount: number,
  expectedReceivedAt: string,
  expectedAllocation: number,
): Promise<void> {
  const credit = payment.ledgerEntryId
    ? await db.ledgerEntry.findFirst({
        where: { organizationId, id: payment.ledgerEntryId },
      })
    : null;
  const allocations = credit
    ? await db.ledgerAllocation.findMany({
        where: { organizationId, creditEntryId: credit.id },
        select: { debitEntryId: true, amount: true },
      })
    : [];
  const allocated = allocations.reduce((sum, entry) => sum + Number(entry.amount), 0);
  const allocationTargetsMatch = allocations.every(
    (allocation) => allocation.debitEntryId === debitEntryId,
  );
  const compatible =
    payment.enrollmentId === enrollmentId &&
    payment.billingAccountId === billingAccountId &&
    payment.methodId === expectedMethodId &&
    payment.status === 'POSTED' &&
    moneyEqual(payment.amount, expectedAmount) &&
    payment.receivedAt.getTime() === new Date(expectedReceivedAt).getTime() &&
    !!credit &&
    credit.enrollmentId === enrollmentId &&
    credit.billingAccountId === billingAccountId &&
    credit.direction === 'CREDIT' &&
    credit.entryType === 'PAYMENT' &&
    credit.sourceType === 'LEGACY_IMPORT_PAYMENT' &&
    credit.sourceId === payment.id &&
    moneyEqual(credit.amount, expectedAmount) &&
    allocationTargetsMatch &&
    moneyEqual(allocated, expectedAllocation);
  if (!compatible)
    throw new ConflictException({
      code: 'IMPORT_PAYMENT_IDEMPOTENCY_COLLISION',
      messageKey: 'imports.paymentIdempotencyCollision',
    });
}

function moneyEqual(actual: Prisma.Decimal | number, expected: number): boolean {
  return Math.round(Number(actual) * 100) === Math.round(expected * 100);
}
