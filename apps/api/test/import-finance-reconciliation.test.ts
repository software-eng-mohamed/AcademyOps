import { describe, expect, it } from 'vitest';
import { reconcileImportFinance } from '../src/imports/import-finance-reconciliation';

import {
  rowId,
  enrollmentId,
  sourceRow,
  database,
  twoPaymentSourceRow,
  swappedAllocationDatabase,
} from './import-finance-reconciliation.fixture';

describe('import financial reconciliation', () => {
  it('matches source price, payment slot, ledger allocation, outstanding and balance in minor units', async () => {
    const metrics = await reconcileImportFinance(database(), 'org', [sourceRow()]);

    expect(metrics.every(({ passed }) => passed)).toBe(true);
    expect(value(metrics, 'finance.enrollment_rows_exact')).toMatchObject({
      sourceValue: 1,
      targetValue: 1,
    });
    expect(value(metrics, 'finance.outstanding_minor')).toMatchObject({
      sourceValue: 4_000,
      targetValue: 4_000,
    });
  });

  it('reports the exact row and blocks a one-cent, method or date mismatch', async () => {
    const db = database({
      amount: 59.99,
      method: 'Transfer',
      receivedAt: '2026-01-03T00:00:00.000Z',
    });
    const metrics = await reconcileImportFinance(db, 'org', [sourceRow()]);

    expect(value(metrics, 'finance.payment_slots_exact').passed).toBe(false);
    expect(value(metrics, 'finance.payment_slots_minor')).toMatchObject({
      sourceValue: 6_000,
      targetValue: 5_999,
      difference: -1,
      passed: false,
    });
    expect(value(metrics, 'finance.row_mismatch_count').targetValue).toBe(1);
    const mismatch = metrics.find(({ metric }) => metric.startsWith('finance.row_mismatch.'));
    expect(mismatch?.dimension).toMatchObject({
      importRowId: rowId,
      rowNumber: 4,
      enrollmentId,
      paymentReferenceCount: 1,
    });
    expect(JSON.stringify(mismatch?.dimension)).toContain('expectedAmountMinor');
  });

  it('rejects a stale payment reference even when every amount, date and method still matches', async () => {
    const db = database({
      amount: 60,
      method: 'Cash',
      receivedAt: '2026-01-02T00:00:00.000Z',
      enrollmentId: '20000000-0000-0000-0000-000000000099',
    });
    const metrics = await reconcileImportFinance(db, 'org', [sourceRow()]);

    expect(value(metrics, 'finance.payment_slots_exact').passed).toBe(false);
    expect(value(metrics, 'finance.enrollment_rows_exact').passed).toBe(false);
    const mismatch = metrics.find(({ metric }) => metric.startsWith('finance.row_mismatch.'));
    expect(mismatch?.dimension).toMatchObject({ importRowId: rowId });
    expect(JSON.stringify(mismatch?.dimension)).toContain('paymentLinkage');
  });

  it('rejects swapped per-payment allocations even when the aggregate allocation matches', async () => {
    const metrics = await reconcileImportFinance(swappedAllocationDatabase(), 'org', [
      twoPaymentSourceRow(),
    ]);

    expect(value(metrics, 'finance.allocated_minor').passed).toBe(true);
    expect(value(metrics, 'finance.payment_slots_exact')).toMatchObject({
      sourceValue: 2,
      targetValue: 0,
      passed: false,
    });
    const mismatch = metrics.find(({ metric }) => metric.startsWith('finance.row_mismatch.'));
    expect(JSON.stringify(mismatch?.dimension)).toContain('expectedAllocationMinor');
  });
});

function value(metrics: Awaited<ReturnType<typeof reconcileImportFinance>>, name: string) {
  return metrics.find(({ metric }) => metric === name)!;
}
