import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPasswordRecoveryCopy } from '@/features/auth/password-recovery-copy';
import { ForgotPasswordScreen } from '@/features/auth/password-recovery-screen';
import { isLocale } from '@/lib/locales';

const ORGANIZATION_CODE_PATTERN = /^[A-Za-z0-9_-]{1,50}$/;

function getOrganizationCode(): string {
  const value = (process.env.WEB_ORGANIZATION_CODE ?? 'ACADEMYOPS').trim().toUpperCase();
  if (!ORGANIZATION_CODE_PATTERN.test(value)) throw new Error('Invalid WEB_ORGANIZATION_CODE.');
  return value;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ method?: string }>;
}): Promise<Metadata> {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const copy = getPasswordRecoveryCopy(isLocale(locale) ? locale : 'ar');
  return {
    title: query.method === 'phone' ? copy.forgotPhoneTitle : copy.forgotEmailTitle,
  };
}

export default async function ForgotPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ method?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  return (
    <ForgotPasswordScreen
      method={query.method === 'phone' ? 'PHONE' : 'EMAIL'}
      locale={locale}
      organizationCode={getOrganizationCode()}
    />
  );
}
