import type { Locale } from '@/lib/locales';
import { labelsPart1 } from './system-copy.labels-1';
import { labelsPart2 } from './system-copy.labels-2';

const labels: Record<string, readonly [string, string]> = { ...labelsPart1, ...labelsPart2 };
export function systemText(locale: Locale, key: string): string {
  return labels[key]?.[locale === 'ar' ? 1 : 0] ?? key;
}
