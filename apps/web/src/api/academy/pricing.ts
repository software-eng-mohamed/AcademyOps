import type { ResponsePricingControllerReadResponse } from '@/api/generated/models/responsePricingControllerReadResponse';
import * as api from '@/api/generated/pricing/pricing';
import type { FeeInstallment, FeeLine } from '@/features/academy/pricing-values';
import { feeTotal, validFeeSchedule } from '@/features/academy/pricing-values';

export type FeeAgreement = ResponsePricingControllerReadResponse;
export type FeeSchedule = FeeAgreement['schedules'][number];
export type FeeAction =
  | 'create'
  | 'edit'
  | 'submit'
  | 'approve'
  | 'reject'
  | 'createSchedule'
  | 'editSchedule'
  | 'approveSchedule';
export type FeeTarget = { action: FeeAction; agreement?: FeeAgreement; schedule?: FeeSchedule };
export const pricingKey = (userId: string, enrollmentId: string) =>
  ['enrollment-pricing', userId, enrollmentId] as const;
export async function listFees(enrollmentId: string, cursor?: string, signal?: AbortSignal) {
  return (
    await api.pricingControllerListV1(
      { enrollmentId, ...(cursor ? { cursor } : {}) },
      { signal: signal ?? null },
    )
  ).data;
}
export async function readFee(id: string, signal?: AbortSignal) {
  return (await api.pricingControllerReadV1(id, { signal: signal ?? null })).data;
}
export async function executeFeeAction(
  target: FeeTarget,
  enrollmentId: string,
  values: {
    lines: FeeLine[];
    discount: string;
    installments: FeeInstallment[];
    reason: string;
  },
  key: string,
) {
  const { action, agreement, schedule } = target;
  const headers: Record<string, string> = { 'Idempotency-Key': key };
  const version = action.endsWith('Schedule') ? schedule?.lockVersion : agreement?.lockVersion;
  if (!['create', 'createSchedule'].includes(action)) {
    if (!Number.isInteger(version) || Number(version) < 0)
      throw new Error('Missing pricing version');
    headers['If-Match'] = String(version);
  }
  const request = { headers };
  const id = agreement?.id ?? '';
  if (action === 'create' || action === 'edit') {
    if (feeTotal(values.lines, values.discount) === null) throw new Error('Invalid fee items');
    const body = {
      lines: values.lines.map(({ type, descriptionAr, descriptionEn, quantity, unitAmount }) => {
        const en = (descriptionEn || descriptionAr || '').trim();
        const ar = (descriptionAr || descriptionEn || '').trim();
        return {
          type,
          descriptionAr: ar,
          descriptionEn: en,
          quantity,
          unitAmount,
        };
      }),
      discountAmount: values.discount,
    };
    return action === 'create'
      ? (await api.pricingControllerCreateV1({ ...body, enrollmentId }, request)).data
      : (await api.pricingControllerUpdateV1(id, body, request)).data;
  }
  if (action === 'createSchedule' || action === 'editSchedule') {
    if (!validFeeSchedule(values.installments, agreement?.totalAmount ?? ''))
      throw new Error('Invalid installment schedule');
    const body = {
      installments: values.installments.map(({ dueDate, amount }) => ({ dueDate, amount })),
    };
    return action === 'createSchedule'
      ? (await api.pricingControllerCreateScheduleV1(id, body, request)).data
      : (await api.pricingControllerUpdateScheduleV1(schedule?.id ?? '', body, request)).data;
  }
  if (action === 'submit') return (await api.pricingControllerSubmitV1(id, request)).data;
  if (action === 'approveSchedule')
    return (await api.pricingControllerApproveScheduleV1(schedule?.id ?? '', request)).data;
  if (values.reason.trim().length < 3 || values.reason.trim().length > 1000)
    throw new Error('Invalid decision reason');
  const operation =
    action === 'approve' ? api.pricingControllerApproveV1 : api.pricingControllerRejectV1;
  return (await operation(id, { reason: values.reason.trim() }, request)).data;
}
