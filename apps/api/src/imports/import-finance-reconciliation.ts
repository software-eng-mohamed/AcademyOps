import { loadImportFinanceRecords } from './import-finance-records';
import {
  emptyMetrics,
  zeroMoney,
  minor,
  normalized,
  addMoney,
  moneyDifferences,
  metric,
  moneyMetrics,
} from './import-finance-metrics';
import type { Prisma } from '@prisma/client';
import type { ImportMetric } from './import-reconciliation';
import { asObject, type MasterValue } from './import-values';

type Db = Prisma.TransactionClient;
type SourceRow = {
  id: string;
  rowHash: string;
  sheetName: string;
  rowNumber?: number;
  normalizedValues: Prisma.JsonValue | null;
};
/** Reconciles source money to independently-read domain records in integer minor units. */
export async function reconcileImportFinance(
  db: Db,
  organizationId: string,
  rows: SourceRow[],
): Promise<ImportMetric[]> {
  if (!rows.length) return emptyMetrics();
  const { references, agreements, entries, payments, allocations, methodNames } =
    await loadImportFinanceRecords(db, organizationId, rows);
  const sourceTotals = zeroMoney();
  const targetTotals = zeroMoney();
  let exactRows = 0;
  let exactSlots = 0;
  let expectedSlots = 0;
  const mismatchMetrics: ImportMetric[] = [];

  for (const row of rows) {
    const value = asObject<MasterValue>(row.normalizedValues);
    const enrollmentReferences = references.filter(
      (reference) =>
        reference.importRowId === row.id &&
        reference.entityType === 'ENROLLMENT' &&
        reference.sourceField === 'MASTER_ROW',
    );
    const enrollmentId =
      enrollmentReferences.length === 1 ? enrollmentReferences[0]!.entityId : undefined;
    const rowAgreements = agreements.filter((agreement) => agreement.enrollmentId === enrollmentId);
    const rowEntries = entries.filter((entry) => entry.enrollmentId === enrollmentId);
    const charges = rowEntries.filter(
      ({ direction, sourceType }) => direction === 'DEBIT' && sourceType === 'LEGACY_IMPORT_CHARGE',
    );
    const rowPaymentReferences = references.filter(
      (reference) =>
        reference.importRowId === row.id &&
        reference.entityType === 'PAYMENT' &&
        reference.sourceField === 'PAYMENT',
    );
    const rowPayments = rowPaymentReferences.flatMap((reference) => {
      const payment = payments.find(({ id }) => id === reference.entityId);
      return payment ? [{ payment, sourceOrdinal: Number(reference.rawValue) }] : [];
    });
    const duplicatePaymentIds = new Set(
      rowPayments
        .map(({ payment }) => payment.id)
        .filter((id, index, ids) => ids.indexOf(id) !== index),
    );
    const invalidPaymentIds = new Set<string>();
    const linkageProblems: Array<Record<string, string | number | null>> = [];
    for (const { payment, sourceOrdinal } of rowPayments) {
      const credit = payment.ledgerEntryId
        ? rowEntries.find(({ id }) => id === payment.ledgerEntryId)
        : undefined;
      const linked =
        payment.enrollmentId === enrollmentId &&
        !!credit &&
        credit.enrollmentId === enrollmentId &&
        credit.direction === 'CREDIT' &&
        credit.entryType === 'PAYMENT' &&
        credit.sourceType === 'LEGACY_IMPORT_PAYMENT' &&
        credit.sourceId === payment.id &&
        minor(credit.amount) === minor(payment.amount) &&
        !duplicatePaymentIds.has(payment.id);
      if (!linked) {
        invalidPaymentIds.add(payment.id);
        linkageProblems.push({
          field: 'paymentLinkage',
          sourceOrdinal,
          paymentId: payment.id,
          paymentEnrollmentId: payment.enrollmentId,
          ledgerEntryId: payment.ledgerEntryId,
          ledgerEnrollmentId: credit?.enrollmentId ?? null,
          ledgerDirection: credit?.direction ?? null,
          ledgerEntryType: credit?.entryType ?? null,
          ledgerSourceType: credit?.sourceType ?? null,
          ledgerSourceId: credit?.sourceId ?? null,
          duplicatePaymentReference: duplicatePaymentIds.has(payment.id) ? 1 : 0,
        });
      }
    }
    const paymentCreditIds = new Set(
      rowPayments.flatMap(({ payment }) => (payment.ledgerEntryId ? [payment.ledgerEntryId] : [])),
    );
    const chargeIds = new Set(charges.map(({ id }) => id));
    const allocated = allocations
      .filter(
        ({ creditEntryId, debitEntryId }) =>
          paymentCreditIds.has(creditEntryId) && chargeIds.has(debitEntryId),
      )
      .reduce((sum, allocation) => sum + minor(allocation.amount), 0);
    const sourcePaid = value.payments.reduce((sum, payment) => sum + minor(payment.amount), 0);
    const source = {
      subtotal: minor(value.subtotal),
      discount: minor(value.discountAmount),
      pricingTotal: minor(value.totalAmount),
      charge: minor(value.totalAmount),
      declaredPaid: minor(value.paidAmount),
      paymentSlots: sourcePaid,
      allocated: Math.min(minor(value.totalAmount), sourcePaid),
      outstanding: minor(value.totalAmount) - Math.min(minor(value.totalAmount), sourcePaid),
      balance: minor(value.totalAmount) - sourcePaid,
    };
    const agreement = rowAgreements.length === 1 ? rowAgreements[0] : undefined;
    const targetPaid = rowPayments
      .filter(({ payment }) => payment.status === 'POSTED')
      .reduce((sum, { payment }) => sum + minor(payment.amount), 0);
    const target = {
      subtotal: agreement ? minor(agreement.subtotal) : 0,
      discount: agreement ? minor(agreement.discountAmount) : 0,
      pricingTotal: agreement ? minor(agreement.totalAmount) : 0,
      charge: charges.reduce((sum, entry) => sum + minor(entry.amount), 0),
      declaredPaid: targetPaid,
      paymentSlots: targetPaid,
      allocated,
      outstanding: charges.reduce((sum, entry) => sum + minor(entry.amount), 0) - allocated,
      balance: rowEntries.reduce(
        (sum, entry) =>
          sum + (entry.direction === 'DEBIT' ? minor(entry.amount) : -minor(entry.amount)),
        0,
      ),
    };
    addMoney(sourceTotals, source);
    addMoney(targetTotals, target);
    expectedSlots += value.payments.length;
    const slotProblems: Array<Record<string, string | number | null>> = [];
    let sourceAllocatedMinor = 0;
    for (const expected of value.payments) {
      const ordinal = expected.sourceOrdinal ?? value.payments.indexOf(expected) + 1;
      const candidates = rowPayments.filter(({ sourceOrdinal }) => sourceOrdinal === ordinal);
      const actual = candidates.length === 1 ? candidates[0]?.payment : undefined;
      const expectedAllocationMinor = Math.min(
        minor(expected.amount),
        Math.max(0, minor(value.totalAmount) - sourceAllocatedMinor),
      );
      sourceAllocatedMinor += expectedAllocationMinor;
      const creditAllocations = actual?.ledgerEntryId
        ? allocations.filter(({ creditEntryId }) => creditEntryId === actual.ledgerEntryId)
        : [];
      const actualAllocationMinor = creditAllocations.reduce(
        (sum, allocation) => sum + minor(allocation.amount),
        0,
      );
      const allocationMatches =
        charges.length === 1 &&
        creditAllocations.every(({ debitEntryId }) => debitEntryId === charges[0]!.id) &&
        actualAllocationMinor === expectedAllocationMinor;
      const matches =
        !!actual &&
        !invalidPaymentIds.has(actual.id) &&
        actual.status === 'POSTED' &&
        minor(actual.amount) === minor(expected.amount) &&
        actual.receivedAt.getTime() === new Date(expected.receivedAt).getTime() &&
        methodNames.get(actual.methodId) === normalized(expected.method) &&
        allocationMatches;
      if (matches) exactSlots += 1;
      else
        slotProblems.push({
          ordinal,
          expectedAmountMinor: minor(expected.amount),
          actualAmountMinor: actual ? minor(actual.amount) : null,
          expectedMethod: expected.method,
          actualMethod: actual ? (methodNames.get(actual.methodId) ?? null) : null,
          expectedReceivedAt: expected.receivedAt,
          actualReceivedAt: actual?.receivedAt.toISOString() ?? null,
          actualStatus: actual?.status ?? null,
          expectedAllocationMinor,
          actualAllocationMinor,
          allocationTargetCount: new Set(creditAllocations.map(({ debitEntryId }) => debitEntryId))
            .size,
        });
    }
    const moneyProblems = moneyDifferences(source, target);
    if (enrollmentReferences.length !== 1)
      linkageProblems.push({
        field: 'enrollmentReferenceCount',
        expected: 1,
        actual: enrollmentReferences.length,
      });
    if (charges.length === 1 && charges[0]!.sourceId !== enrollmentId)
      linkageProblems.push({
        field: 'chargeSourceId',
        expected: enrollmentId ?? null,
        actual: charges[0]!.sourceId,
      });
    if (
      enrollmentId &&
      enrollmentReferences.length === 1 &&
      rowAgreements.length === 1 &&
      charges.length === 1 &&
      charges[0]!.sourceId === enrollmentId &&
      rowPayments.length === value.payments.length &&
      !linkageProblems.length &&
      !slotProblems.length &&
      !moneyProblems.length
    )
      exactRows += 1;
    else
      mismatchMetrics.push({
        metric: `finance.row_mismatch.${row.rowHash.slice(0, 20)}`,
        sourceValue: 0,
        targetValue: 1,
        difference: 1,
        passed: false,
        dimension: {
          importRowId: row.id,
          sheetName: row.sheetName,
          rowNumber: row.rowNumber ?? null,
          rowHash: row.rowHash,
          enrollmentId: enrollmentId ?? null,
          approvedAgreementCount: rowAgreements.length,
          chargeCount: charges.length,
          paymentReferenceCount: rowPayments.length,
          problems: [...moneyProblems, ...linkageProblems, ...slotProblems].map((problem) =>
            JSON.stringify(problem),
          ),
        },
      });
  }

  return [
    metric('finance.enrollment_rows_exact', rows.length, exactRows),
    metric('finance.payment_slots_exact', expectedSlots, exactSlots),
    ...moneyMetrics(sourceTotals, targetTotals),
    metric('finance.row_mismatch_count', 0, mismatchMetrics.length),
    ...mismatchMetrics,
  ];
}
