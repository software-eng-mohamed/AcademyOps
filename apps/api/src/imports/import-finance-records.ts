import type { Prisma } from '@prisma/client';
import { normalized, unique } from './import-finance-metrics';

export async function loadImportFinanceRecords(
  db: Prisma.TransactionClient,
  organizationId: string,
  rows: { id: string }[],
) {
  const rowIds = rows.map(({ id }) => id);
  const references = await db.legacyReference.findMany({
    where: { organizationId, importRowId: { in: rowIds } },
    select: {
      importRowId: true,
      entityType: true,
      entityId: true,
      sourceField: true,
      rawValue: true,
    },
  });
  const enrollmentIds = unique(
    references
      .filter(
        ({ entityType, sourceField }) =>
          entityType === 'ENROLLMENT' && sourceField === 'MASTER_ROW',
      )
      .map(({ entityId }) => entityId),
  );
  const paymentIds = unique(
    references
      .filter(
        ({ entityType, sourceField }) => entityType === 'PAYMENT' && sourceField === 'PAYMENT',
      )
      .map(({ entityId }) => entityId),
  );
  const [agreements, entries, payments, methods] = await Promise.all([
    db.pricingAgreement.findMany({
      where: { organizationId, enrollmentId: { in: enrollmentIds }, status: 'APPROVED' },
      select: { enrollmentId: true, subtotal: true, discountAmount: true, totalAmount: true },
    }),
    db.ledgerEntry.findMany({
      where: { organizationId, enrollmentId: { in: enrollmentIds } },
      select: {
        id: true,
        enrollmentId: true,
        direction: true,
        entryType: true,
        sourceType: true,
        sourceId: true,
        amount: true,
      },
    }),
    db.payment.findMany({
      where: { organizationId, id: { in: paymentIds } },
      select: {
        id: true,
        enrollmentId: true,
        ledgerEntryId: true,
        methodId: true,
        status: true,
        amount: true,
        receivedAt: true,
      },
    }),
    db.paymentMethod.findMany({
      where: { organizationId },
      select: { id: true, name: true },
    }),
  ]);
  const allocations = await db.ledgerAllocation.findMany({
    where: {
      organizationId,
      OR: [
        {
          creditEntryId: {
            in: payments.flatMap(({ ledgerEntryId }) => (ledgerEntryId ? [ledgerEntryId] : [])),
          },
        },
        { debitEntryId: { in: entries.map(({ id }) => id) } },
      ],
    },
    select: { creditEntryId: true, debitEntryId: true, amount: true },
  });
  const methodNames = new Map(methods.map(({ id, name }) => [id, normalized(name)]));
  return { references, agreements, entries, payments, allocations, methodNames };
}
