import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPasswordRecoveryCopy } from '@/features/auth/password-recovery-copy';
import { ResetPasswordScreen } from '@/features/auth/password-recovery-screen';
import { isLocale } from '@/lib/locales';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: getPasswordRecoveryCopy(isLocale(locale) ? locale : 'ar').resetMetadataTitle,
  };
}

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <ResetPasswordScreen locale={locale} />;
}
