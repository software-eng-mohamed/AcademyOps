import type { InstallmentDto } from '@/api/generated/models/installmentDto';
import type { PricingAgreementLineDto } from '@/api/generated/models/pricingAgreementLineDto';

export type FeeLine = PricingAgreementLineDto & { key: string };
export type FeeInstallment = InstallmentDto & { key: string };
export const feeTypes = ['TUITION', 'REGISTRATION', 'MATERIALS', 'OTHER'] as const;
export const newFeeLine = (): FeeLine => ({
  key: crypto.randomUUID(),
  type: 'TUITION',
  descriptionAr: '',
  descriptionEn: '',
  quantity: '1',
  unitAmount: '',
});
export const newFeeInstallment = (): FeeInstallment => ({
  key: crypto.randomUUID(),
  dueDate: '',
  amount: '',
});

// Integer minor units keep installment comparisons exact (including 0.10 + 0.20).
export function feeMinorUnits(value: string): bigint | null {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(value)) return null;
  const [whole = '', fraction = ''] = value.split('.');
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
}
export function feeTotal(lines: FeeLine[], discount: string): bigint | null {
  if (!lines.length || lines.length > 100) return null;
  let subtotal = BigInt(0);
  for (const line of lines) {
    const quantity = feeMinorUnits(line.quantity);
    const amount = feeMinorUnits(line.unitAmount);
    const descEn = (line.descriptionEn || line.descriptionAr || '').trim();
    const descAr = (line.descriptionAr || line.descriptionEn || '').trim();
    const rawDescEn = typeof line.descriptionEn === 'string' ? line.descriptionEn.trim() : '';
    const rawDescAr = typeof line.descriptionAr === 'string' ? line.descriptionAr.trim() : '';
    if (
      quantity === null ||
      quantity <= BigInt(0) ||
      amount === null ||
      !feeTypes.includes(line.type) ||
      !descEn ||
      descEn.length > 500 ||
      !descAr ||
      descAr.length > 500 ||
      (line.descriptionAr !== undefined &&
        line.descriptionEn !== undefined &&
        (!rawDescEn || !rawDescAr))
    )
      return null;
    subtotal += (quantity * amount + BigInt(50)) / BigInt(100);
  }
  const reduction = feeMinorUnits(discount);
  if (subtotal <= BigInt(0) || reduction === null || reduction > subtotal) return null;
  return subtotal - reduction;
}
export function validFeeSchedule(installments: FeeInstallment[], total: string): boolean {
  if (!installments.length || installments.length > 100) return false;
  let sum = BigInt(0);
  let previousDate = '';
  for (const item of installments) {
    const amount = feeMinorUnits(item.amount);
    const date = new Date(`${item.dueDate}T00:00:00.000Z`);
    if (
      amount === null ||
      amount <= BigInt(0) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(item.dueDate) ||
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== item.dueDate ||
      item.dueDate < previousDate
    )
      return false;
    sum += amount;
    previousDate = item.dueDate;
  }
  return sum === feeMinorUnits(total);
}
