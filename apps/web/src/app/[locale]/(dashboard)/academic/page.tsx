import { redirect } from 'next/navigation';
import { isLocale } from '@/lib/locales';

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  redirect(`/${locale}/academic/cohorts`);
}
