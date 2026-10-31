import type { Locale } from '@/lib/locales';
export const studentMoney = (amount: string | number, locale: Locale) =>
  new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-EG', {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount));
