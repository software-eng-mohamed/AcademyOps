import { describe, expect, it, vi } from 'vitest';
import { executeFeeAction, type FeeAgreement } from '@/api/academy/pricing';
import * as api from '@/api/generated/pricing/pricing';
import {
  type FeeLine,
  feeMinorUnits,
  feeTotal,
  validFeeSchedule,
} from '@/features/academy/pricing-values';

vi.mock('@/api/generated/pricing/pricing', () => ({
  pricingControllerCreateV1: vi.fn(async () => ({ data: { id: 'fee-1' } })),
  pricingControllerUpdateV1: vi.fn(async () => ({ data: {} })),
  pricingControllerApproveV1: vi.fn(async () => ({ data: {} })),
  pricingControllerCreateScheduleV1: vi.fn(async () => ({ data: {} })),
  pricingControllerUpdateScheduleV1: vi.fn(async () => ({ data: {} })),
  pricingControllerSubmitV1: vi.fn(async () => ({ data: {} })),
  pricingControllerRejectV1: vi.fn(async () => ({ data: {} })),
  pricingControllerApproveScheduleV1: vi.fn(async () => ({ data: {} })),
}));
const line: FeeLine = {
  key: 'local-only',
  type: 'TUITION',
  descriptionAr: 'رسوم الدراسة',
  descriptionEn: ' Tuition ',
  quantity: '1',
  unitAmount: '100',
};
const agreement = { id: 'fee-1', lockVersion: 3, totalAmount: '100.00' } as FeeAgreement;
const values = {
  lines: [line],
  discount: '0',
  reason: 'Approved course fees',
  installments: [{ key: 'local-only', dueDate: '2026-10-01', amount: '100' }],
};

describe('exact fee and installment validation', () => {
  it('rejects negative, scientific, blank and over-precision values', () => {
    for (const value of ['', '-1', '1e2', '0.001', 'Infinity'])
      expect(feeMinorUnits(value)).toBeNull();
  });
  it('rounds each fee line like the backend before discounting', () => {
    expect(
      feeTotal(
        [
          { ...line, quantity: '0.5', unitAmount: '0.01' },
          { ...line, key: '2', unitAmount: '10' },
        ],
        '0.01',
      ),
    ).toBe(BigInt(1000));
  });
  it('requires positive quantities, descriptions and a bounded discount', () => {
    expect(feeTotal([], '0')).toBeNull();
    expect(feeTotal([{ ...line, quantity: '0' }], '0')).toBeNull();
    expect(feeTotal([{ ...line, descriptionAr: ' ' }], '0')).toBeNull();
    expect(feeTotal([line], '101')).toBeNull();
    expect(feeTotal([line], '100')).toBe(BigInt(0));
  });
  it('compares installment totals exactly and rejects invalid dates/order/zero', () => {
    const entries = [
      { key: 'a', dueDate: '2026-10-01', amount: '0.10' },
      { key: 'b', dueDate: '2026-11-01', amount: '0.20' },
    ];
    expect(validFeeSchedule(entries, '0.30')).toBe(true);
    expect(validFeeSchedule(entries, '0.31')).toBe(false);
    expect(validFeeSchedule([...entries].reverse(), '0.30')).toBe(false);
    expect(validFeeSchedule([{ key: 'a', dueDate: '2026-02-30', amount: '0.30' }], '0.30')).toBe(
      false,
    );
    expect(validFeeSchedule([{ key: 'a', dueDate: '2026-10-01', amount: '0' }], '0')).toBe(false);
  });
});
describe('pricing API adapters', () => {
  it('sends real enrollment context, trimmed descriptions and stable key, without UI keys', async () => {
    await executeFeeAction({ action: 'create' }, 'enrollment-1', values, 'stable-key');
    expect(api.pricingControllerCreateV1).toHaveBeenLastCalledWith(
      {
        enrollmentId: 'enrollment-1',
        discountAmount: '0',
        lines: [
          {
            type: 'TUITION',
            descriptionAr: 'رسوم الدراسة',
            descriptionEn: 'Tuition',
            quantity: '1',
            unitAmount: '100',
          },
        ],
      },
      { headers: { 'Idempotency-Key': 'stable-key' } },
    );
  });
  it('uses lockVersion, not business version, for agreement mutations', async () => {
    await executeFeeAction({ action: 'approve', agreement }, 'enrollment-1', values, 'stable-key');
    expect(api.pricingControllerApproveV1).toHaveBeenLastCalledWith(
      'fee-1',
      { reason: values.reason },
      { headers: { 'Idempotency-Key': 'stable-key', 'If-Match': '3' } },
    );
    await expect(executeFeeAction({ action: 'submit' }, 'e', values, 'k')).rejects.toThrow(
      'Missing pricing version',
    );
  });
  it('uses schedule lockVersion and excludes internal installment fields', async () => {
    const schedule = { id: 'schedule-1', lockVersion: 7 } as FeeAgreement['schedules'][number];
    await executeFeeAction(
      { action: 'editSchedule', agreement, schedule },
      'e',
      values,
      'schedule-key',
    );
    expect(api.pricingControllerUpdateScheduleV1).toHaveBeenLastCalledWith(
      'schedule-1',
      { installments: [{ dueDate: '2026-10-01', amount: '100' }] },
      { headers: { 'Idempotency-Key': 'schedule-key', 'If-Match': '7' } },
    );
    await expect(
      executeFeeAction(
        { action: 'createSchedule', agreement },
        'e',
        { ...values, installments: [] },
        'k',
      ),
    ).rejects.toThrow('Invalid installment schedule');
  });
  it('wires every remaining lifecycle command to its generated operation', async () => {
    const schedule = { id: 'schedule-1', lockVersion: 7 } as FeeAgreement['schedules'][number];
    for (const action of ['edit', 'submit', 'reject', 'createSchedule', 'approveSchedule'] as const)
      await executeFeeAction({ action, agreement, schedule }, 'e', values, action);
    expect(api.pricingControllerUpdateV1).toHaveBeenCalled();
    expect(api.pricingControllerSubmitV1).toHaveBeenCalled();
    expect(api.pricingControllerRejectV1).toHaveBeenCalled();
    expect(api.pricingControllerCreateScheduleV1).toHaveBeenCalled();
    expect(api.pricingControllerApproveScheduleV1).toHaveBeenLastCalledWith('schedule-1', {
      headers: { 'Idempotency-Key': 'approveSchedule', 'If-Match': '7' },
    });
  });
});
