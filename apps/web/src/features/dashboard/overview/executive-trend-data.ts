import type { ResponseTrendPoint } from '@/api/generated/models/responseTrendPoint';
import type { Locale } from '@/lib/locales';

export type ComparisonRow = {
  period: string;
  periodKey: string;
  formattedValue: string;
  rawValue: number;
  deltaPercent?: number;
};

export function finiteMetric(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function buildMonthlyComparison(
  points: ResponseTrendPoint[],
  locale: Locale,
  format: (value: number) => string,
): ComparisonRow[] {
  const formatter = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const recorded = points
    .filter((point) => /^\d{4}-(0[1-9]|1[0-2])$/.test(point.period))
    .map((point) => ({
      ...point,
      value: finiteMetric(point.value),
      month: Number(point.period.slice(0, 4)) * 12 + Number(point.period.slice(5)),
    }))
    .filter((point): point is typeof point & { value: number } => point.value !== null)
    .toSorted((left, right) => left.month - right.month);

  return recorded
    .map((point, index) => {
      const previous = recorded[index - 1];
      const deltaPercent =
        previous && previous.month + 1 === point.month && previous.value !== 0
          ? ((point.value - previous.value) / Math.abs(previous.value)) * 100
          : undefined;
      return {
        periodKey: point.period,
        period: formatter.format(new Date(`${point.period}-01T00:00:00Z`)),
        rawValue: point.value,
        formattedValue: format(point.value),
        ...(deltaPercent !== undefined && Number.isFinite(deltaPercent)
          ? { deltaPercent: Math.round(deltaPercent * 10) / 10 }
          : {}),
      };
    })
    .toReversed();
}
