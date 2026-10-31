import type { Prisma } from '@prisma/client';
import type { ImportMetric } from './import-reconciliation';

type Money = {
  subtotal: number;
  discount: number;
  pricingTotal: number;
  charge: number;
  declaredPaid: number;
  paymentSlots: number;
  allocated: number;
  outstanding: number;
  balance: number;
};

export function moneyMetrics(source: Money, target: Money): ImportMetric[] {
  return (Object.keys(source) as Array<keyof Money>).map((key) =>
    metric(`finance.${snakeCase(key)}_minor`, source[key], target[key]),
  );
}
export function moneyDifferences(source: Money, target: Money) {
  return (Object.keys(source) as Array<keyof Money>).flatMap((key) =>
    source[key] === target[key]
      ? []
      : [{ field: key, expectedMinor: source[key], actualMinor: target[key] }],
  );
}
export function emptyMetrics(): ImportMetric[] {
  return [
    metric('finance.enrollment_rows_exact', 0, 0),
    metric('finance.payment_slots_exact', 0, 0),
    ...moneyMetrics(zeroMoney(), zeroMoney()),
    metric('finance.row_mismatch_count', 0, 0),
  ];
}
export function metric(name: string, sourceValue: number, targetValue: number): ImportMetric {
  return {
    metric: name,
    sourceValue,
    targetValue,
    difference: targetValue - sourceValue,
    passed: targetValue === sourceValue,
  };
}
export function minor(value: Prisma.Decimal | string | number): number {
  return Math.round(Number(value) * 100);
}
export function normalized(value: string): string {
  return value.trim().toLocaleUpperCase('en-US');
}
export function snakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
export function unique(values: string[]): string[] {
  return [...new Set(values)];
}
export function zeroMoney(): Money {
  return {
    subtotal: 0,
    discount: 0,
    pricingTotal: 0,
    charge: 0,
    declaredPaid: 0,
    paymentSlots: 0,
    allocated: 0,
    outstanding: 0,
    balance: 0,
  };
}
export function addMoney(total: Money, value: Money): void {
  for (const key of Object.keys(total) as Array<keyof Money>) total[key] += value[key];
}
