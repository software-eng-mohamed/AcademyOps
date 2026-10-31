import { Prisma } from '@prisma/client';

export type Severity = 'INFO' | 'WARNING' | 'CRITICAL';
export type TrendPoint = { period: string; value: number };

export function attendanceBand(ratio: number): 'BELOW_MINIMUM' | 'NEAR_THRESHOLD' | 'HEALTHY' {
  if (ratio < 0.8) return 'BELOW_MINIMUM';
  if (ratio < 0.85) return 'NEAR_THRESHOLD';
  return 'HEALTHY';
}

export function isCountedAttendance(status: string): boolean {
  return ['PRESENT', 'LATE', 'ABSENT'].includes(status);
}

export function attendanceScore(status: string, makeupApproved: boolean): number {
  return status === 'PRESENT' || status === 'LATE' || (status === 'ABSENT' && makeupApproved)
    ? 1
    : 0;
}

export function cairoParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: value('year'), month: value('month'), day: value('day') };
}

export function cairoOffsetMilliseconds(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const represented = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    value('hour'),
    value('minute'),
    value('second'),
  );
  return represented - Math.floor(date.getTime() / 1000) * 1000;
}

export function cairoMidnight(year: number, month: number, day: number): Date {
  const guess = new Date(Date.UTC(year, month - 1, day));
  return new Date(guess.getTime() - cairoOffsetMilliseconds(guess));
}

export function money(value: Prisma.Decimal | number | string): string {
  return new Prisma.Decimal(value).toFixed(2);
}

export function countValues(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((result, value) => {
    result[value] = (result[value] ?? 0) + 1;
    return result;
  }, {});
}
