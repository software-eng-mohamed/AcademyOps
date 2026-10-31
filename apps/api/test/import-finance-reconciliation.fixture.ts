/* eslint-disable @typescript-eslint/require-await -- Prisma test doubles intentionally mirror async client methods. */
export const rowId = '10000000-0000-0000-0000-000000000001';
export const enrollmentId = '20000000-0000-0000-0000-000000000001';
const paymentId = '30000000-0000-0000-0000-000000000001';
const creditId = '40000000-0000-0000-0000-000000000001';
const debitId = '50000000-0000-0000-0000-000000000001';
const methodId = '60000000-0000-0000-0000-000000000001';

export function sourceRow() {
  return {
    id: rowId,
    rowHash: 'a'.repeat(64),
    sheetName: 'Master Sheet',
    rowNumber: 4,
    normalizedValues: {
      legacyCode: 'L-1',
      state: 'Active',
      name: 'Student',
      phone: null,
      email: null,
      kind: 'Individual',
      branch: 'Main',
      deliveryMode: 'IN_PERSON',
      programCode: 'P',
      cohortCode: 'P 1',
      subtotal: 100,
      discountAmount: 0,
      totalAmount: 100,
      paidAmount: 60,
      payments: [
        {
          amount: 60,
          method: 'Cash',
          receivedAt: '2026-01-02T00:00:00.000Z',
          sourceOrdinal: 1,
        },
      ],
    },
  };
}

export function database(
  payment: { amount: number; method: string; receivedAt: string; enrollmentId?: string } = {
    amount: 60,
    method: 'Cash',
    receivedAt: '2026-01-02T00:00:00.000Z',
  },
) {
  return {
    legacyReference: {
      findMany: async () => [
        {
          importRowId: rowId,
          entityType: 'ENROLLMENT',
          entityId: enrollmentId,
          sourceField: 'MASTER_ROW',
          rawValue: 'L-1|P 1',
        },
        {
          importRowId: rowId,
          entityType: 'PAYMENT',
          entityId: paymentId,
          sourceField: 'PAYMENT',
          rawValue: '1',
        },
      ],
    },
    pricingAgreement: {
      findMany: async () => [{ enrollmentId, subtotal: 100, discountAmount: 0, totalAmount: 100 }],
    },
    ledgerEntry: {
      findMany: async () => [
        {
          id: debitId,
          enrollmentId,
          direction: 'DEBIT',
          entryType: 'TUITION_CHARGE',
          sourceType: 'LEGACY_IMPORT_CHARGE',
          sourceId: enrollmentId,
          amount: 100,
        },
        {
          id: creditId,
          enrollmentId,
          direction: 'CREDIT',
          entryType: 'PAYMENT',
          sourceType: 'LEGACY_IMPORT_PAYMENT',
          sourceId: paymentId,
          amount: payment.amount,
        },
      ],
    },
    payment: {
      findMany: async () => [
        {
          id: paymentId,
          enrollmentId: payment.enrollmentId ?? enrollmentId,
          ledgerEntryId: creditId,
          methodId,
          status: 'POSTED',
          amount: payment.amount,
          receivedAt: new Date(payment.receivedAt),
        },
      ],
    },
    paymentMethod: { findMany: async () => [{ id: methodId, name: payment.method }] },
    ledgerAllocation: {
      findMany: async () => [
        { creditEntryId: creditId, debitEntryId: debitId, amount: payment.amount },
      ],
    },
  } as never;
}

export function twoPaymentSourceRow() {
  const row = sourceRow();
  return {
    ...row,
    normalizedValues: {
      ...row.normalizedValues,
      paidAmount: 100,
      payments: [
        {
          amount: 40,
          method: 'Cash',
          receivedAt: '2026-01-02T00:00:00.000Z',
          sourceOrdinal: 1,
        },
        {
          amount: 60,
          method: 'Cash',
          receivedAt: '2026-01-03T00:00:00.000Z',
          sourceOrdinal: 2,
        },
      ],
    },
  };
}

export function swappedAllocationDatabase() {
  const secondPaymentId = '30000000-0000-0000-0000-000000000002';
  const secondCreditId = '40000000-0000-0000-0000-000000000002';
  return {
    legacyReference: {
      findMany: async () => [
        {
          importRowId: rowId,
          entityType: 'ENROLLMENT',
          entityId: enrollmentId,
          sourceField: 'MASTER_ROW',
          rawValue: 'L-1|P 1',
        },
        {
          importRowId: rowId,
          entityType: 'PAYMENT',
          entityId: paymentId,
          sourceField: 'PAYMENT',
          rawValue: '1',
        },
        {
          importRowId: rowId,
          entityType: 'PAYMENT',
          entityId: secondPaymentId,
          sourceField: 'PAYMENT',
          rawValue: '2',
        },
      ],
    },
    pricingAgreement: {
      findMany: async () => [{ enrollmentId, subtotal: 100, discountAmount: 0, totalAmount: 100 }],
    },
    ledgerEntry: {
      findMany: async () => [
        {
          id: debitId,
          enrollmentId,
          direction: 'DEBIT',
          entryType: 'TUITION_CHARGE',
          sourceType: 'LEGACY_IMPORT_CHARGE',
          sourceId: enrollmentId,
          amount: 100,
        },
        {
          id: creditId,
          enrollmentId,
          direction: 'CREDIT',
          entryType: 'PAYMENT',
          sourceType: 'LEGACY_IMPORT_PAYMENT',
          sourceId: paymentId,
          amount: 40,
        },
        {
          id: secondCreditId,
          enrollmentId,
          direction: 'CREDIT',
          entryType: 'PAYMENT',
          sourceType: 'LEGACY_IMPORT_PAYMENT',
          sourceId: secondPaymentId,
          amount: 60,
        },
      ],
    },
    payment: {
      findMany: async () => [
        {
          id: paymentId,
          enrollmentId,
          ledgerEntryId: creditId,
          methodId,
          status: 'POSTED',
          amount: 40,
          receivedAt: new Date('2026-01-02T00:00:00.000Z'),
        },
        {
          id: secondPaymentId,
          enrollmentId,
          ledgerEntryId: secondCreditId,
          methodId,
          status: 'POSTED',
          amount: 60,
          receivedAt: new Date('2026-01-03T00:00:00.000Z'),
        },
      ],
    },
    paymentMethod: { findMany: async () => [{ id: methodId, name: 'Cash' }] },
    ledgerAllocation: {
      findMany: async () => [
        { creditEntryId: creditId, debitEntryId: debitId, amount: 60 },
        { creditEntryId: secondCreditId, debitEntryId: debitId, amount: 40 },
      ],
    },
  } as never;
}
