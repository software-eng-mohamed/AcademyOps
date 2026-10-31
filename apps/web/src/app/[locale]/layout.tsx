import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { LocaleDocumentAttributes } from '@/components/locale-document-attributes';
import { isLocale } from '@/lib/locales';

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <>
      <LocaleDocumentAttributes locale={locale} />
      {children}
    </>
  );
}
