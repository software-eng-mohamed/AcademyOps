'use client';

import { useLayoutEffect } from 'react';
import { directionFor, type Locale } from '@/lib/locales';

export function LocaleDocumentAttributes({ locale }: { locale: Locale }) {
  useLayoutEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = directionFor(locale);
  }, [locale]);

  return null;
}
