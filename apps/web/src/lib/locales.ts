export const locales = ['ar', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'ar';

export function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}

export function localeFromPath(pathname: string | null): Locale {
  const candidate = pathname?.split('/').filter(Boolean)[0];
  return candidate && isLocale(candidate) ? candidate : defaultLocale;
}

export function directionFor(locale: Locale) {
  return locale === 'ar' ? ('rtl' as const) : ('ltr' as const);
}
