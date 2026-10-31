import { BadRequestException } from '@nestjs/common';

export type DashboardPeriodRange = {
  from: Date;
  toExclusive: Date;
  fromMonth: string;
  toMonth: string;
  timeZone: 'Africa/Cairo';
};

function cairoOffsetMilliseconds(date: Date): number {
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

function cairoMidnight(year: number, month: number, day: number): Date {
  const guess = new Date(Date.UTC(year, month - 1, day));
  return new Date(guess.getTime() - cairoOffsetMilliseconds(guess));
}

function cairoMonth(date: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === 'year')?.value ?? 0),
    month: Number(parts.find((part) => part.type === 'month')?.value ?? 0),
  };
}

function key(year: number, month: number) {
  const normalized = new Date(Date.UTC(year, month - 1, 1));
  return `${normalized.getUTCFullYear()}-${String(normalized.getUTCMonth() + 1).padStart(2, '0')}`;
}

function parse(value: string) {
  const [year, month] = value.split('-').map(Number);
  return { year: year ?? 0, month: month ?? 0 };
}

function invalidRange(): never {
  throw new BadRequestException({
    code: 'DASHBOARD_PERIOD_INVALID',
    messageKey: 'dashboard.periodInvalid',
  });
}

export function resolveDashboardPeriod(
  input: { fromMonth?: string; toMonth?: string },
  now = new Date(),
): DashboardPeriodRange {
  if (Boolean(input.fromMonth) !== Boolean(input.toMonth)) invalidRange();

  const current = cairoMonth(now);
  const toMonth = input.toMonth ?? key(current.year, current.month);
  const fromMonth = input.fromMonth ?? key(current.year, current.month - 5);
  const from = parse(fromMonth);
  const to = parse(toMonth);
  const months = (to.year - from.year) * 12 + to.month - from.month + 1;
  const futureMonths = (to.year - current.year) * 12 + to.month - current.month;

  if (months < 1 || months > 12 || futureMonths > 0) invalidRange();

  return {
    from: cairoMidnight(from.year, from.month, 1),
    toExclusive: cairoMidnight(to.year, to.month + 1, 1),
    fromMonth,
    toMonth,
    timeZone: 'Africa/Cairo',
  };
}
