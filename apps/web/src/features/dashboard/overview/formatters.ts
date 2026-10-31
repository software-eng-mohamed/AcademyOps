import type { Locale } from '@/lib/locales';

export function localeTag(locale: Locale) {
  return locale === 'ar' ? 'ar-EG' : 'en-EG';
}

export function formatCount(value: number, locale: Locale) {
  return new Intl.NumberFormat(localeTag(locale), { maximumFractionDigits: 0 }).format(value);
}

export function formatCurrency(value: number | string, currencyCode: string, locale: Locale) {
  const numericValue = typeof value === 'number' ? value : Number(value);
  return new Intl.NumberFormat(localeTag(locale), {
    currency: currencyCode,
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(Number.isFinite(numericValue) ? numericValue : 0);
}

export function formatSignedPercent(value: number, locale: Locale) {
  return new Intl.NumberFormat(localeTag(locale), {
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
    style: 'percent',
  }).format(value);
}

export function formatPercentage(value: number | string | null, locale: Locale) {
  if (value === null) return '—';
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) return '—';
  const ratio = numericValue > 1 ? numericValue / 100 : numericValue;
  return new Intl.NumberFormat(localeTag(locale), {
    maximumFractionDigits: 1,
    style: 'percent',
  }).format(ratio);
}

export function formatDateTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(localeTag(locale), {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    timeZone: 'Africa/Cairo',
  }).format(new Date(value));
}

export function formatSessionTime(value: string | null, locale: Locale, fallback: string) {
  if (!value) return fallback;
  return new Intl.DateTimeFormat(localeTag(locale), {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Africa/Cairo',
  }).format(new Date(value));
}

export function presentationLabel(labels: Record<string, string>, code: string) {
  return labels[code] ?? code;
}

export function contextLabel(context: Record<string, number | string>, fallback: string) {
  for (const key of ['studentName', 'name', 'reference', 'code']) {
    const value = context[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return fallback;
}
