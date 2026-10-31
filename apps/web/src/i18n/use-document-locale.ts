'use client';

import { usePathname } from 'next/navigation';
import type { Locale } from '@/lib/locales';
import { localeFromPath } from '@/lib/locales';

export function useDocumentLocale(): Locale {
  return localeFromPath(usePathname());
}
