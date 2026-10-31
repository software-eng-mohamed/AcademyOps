import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import type { AcademySection } from '@/api/academy/models';
import { readCurrentUser } from '@/api/server/current-user';
import { canUseStaffPage, hasPermission, staffScopes } from '@/features/dashboard/navigation';
import { OverviewUnavailable } from '@/features/dashboard/overview/overview-unavailable';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { isLocale } from '@/lib/locales';
import { AcademyPage } from './academy-page';

export async function AcademyRoute({
  section,
  params,
}: {
  section: AcademySection;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const user = await readCurrentUser();
  if (!user) redirect(`/${locale}/login`);
  const permission =
    section === 'leads'
      ? 'leads.read'
      : section === 'students'
        ? 'students.read_basic'
        : section === 'registrations'
          ? 'students.registration.manage'
          : section === 'enrollments'
            ? 'enrollments.read'
            : 'academic.catalog.read';
  if (!canUseStaffPage(user, section) || !hasPermission(user, permission, staffScopes(user)))
    return <OverviewUnavailable />;
  return (
    <Suspense
      fallback={
        <p className="p-8 text-sm text-text-secondary" role="status">
          {getAcademyCopy(locale).loading}
        </p>
      }
    >
      <AcademyPage section={section} user={user} />
    </Suspense>
  );
}
