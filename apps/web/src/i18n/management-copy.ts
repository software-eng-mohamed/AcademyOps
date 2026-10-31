import type { Locale } from '@/lib/locales';
import { stringsPart1 } from './management-copy.strings-1';
import { stringsPart2 } from './management-copy.strings-2';

const strings: Record<string, readonly [string, string]> = { ...stringsPart1, ...stringsPart2 };
export function managementText(locale: Locale, key: string): string {
  return (
    strings[key]?.[locale === 'ar' ? 1 : 0] ??
    key.replaceAll('_', ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
  );
}
