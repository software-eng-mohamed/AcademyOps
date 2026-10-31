import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { readCurrentUser } from '@/api/server/current-user';
import {
  canUseStaffPage,
  getPrimaryRoleCode,
  hasPermission,
  staffScopes,
} from '@/features/dashboard/navigation';
import { OverviewUnavailable } from '@/features/dashboard/overview/overview-unavailable';
import { StudentRoute } from '@/features/student/student-route';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { isLocale } from '@/lib/locales';
import { type ManagementSection, sectionPermissions } from './config';
import { ManagementPage } from './management-page';

export async function ManagementRoute({
  section,
  params,
}: {
  section: ManagementSection;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const user = await readCurrentUser();
  if (!user) redirect(`/${locale}/login`);
  if (
    getPrimaryRoleCode(user) === 'STUDENT' &&
    ['attendance', 'finance', 'certificates'].includes(section)
  )
    return (
      <StudentRoute
        section={section as 'attendance' | 'finance' | 'certificates'}
        params={params}
      />
    );
  const permissions = sectionPermissions[section].map((permission) =>
    hasPermission(user, permission, staffScopes(user)),
  );
  if (
    !canUseStaffPage(user, section) ||
    !(section === 'documents' ? permissions.some(Boolean) : permissions.every(Boolean))
  )
    return <OverviewUnavailable />;
  return (
    <Suspense
      fallback={
        <p role="status" className="p-8 text-sm text-text-secondary">
          {getAcademyCopy(locale).loading}
        </p>
      }
    >
      <ManagementPage section={section} user={user} />
    </Suspense>
  );
}
