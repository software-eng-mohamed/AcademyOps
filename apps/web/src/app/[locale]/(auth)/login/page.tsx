import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { readCurrentUser } from '@/api/server/current-user';
import { getLoginCopy } from '@/features/auth/login-copy';
import { LoginScreen } from '@/features/auth/login-screen';
import { isLocale } from '@/lib/locales';

const ORGANIZATION_CODE_PATTERN = /^[A-Za-z0-9_-]{1,50}$/;

function getOrganizationCode(): string {
  const organizationCode = (process.env.WEB_ORGANIZATION_CODE ?? 'ACADEMYOPS').trim().toUpperCase();
  if (!ORGANIZATION_CODE_PATTERN.test(organizationCode)) {
    throw new Error('WEB_ORGANIZATION_CODE must contain only letters, numbers, - or _.');
  }
  return organizationCode;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const copy = getLoginCopy(isLocale(locale) ? locale : 'ar');
  return {
    description: copy.metadataDescription,
    title: copy.metadataTitle,
  };
}

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const currentUser = await readCurrentUser();
  if (currentUser) redirect(`/${locale}/dashboard`);

  return <LoginScreen locale={locale} organizationCode={getOrganizationCode()} />;
}
