import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { readCurrentUser } from '@/api/server/current-user';
import type { StudentSection } from '@/api/student/queries';
import { getPrimaryRoleCode, hasPermission } from '@/features/dashboard/navigation';
import { OverviewUnavailable } from '@/features/dashboard/overview/overview-unavailable';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { isLocale } from '@/lib/locales';
import { StudentPage } from './student-page';

export const studentPermissions = {
  learning: 'enrollments.read',
  schedule: 'academic.catalog.read',
  attendance: 'attendance.read',
  finance: 'finance.balance.read',
  certificates: 'certificates.read',
} as const;
export async function StudentRoute({
  section,
  params,
}: {
  section: StudentSection;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const user = await readCurrentUser();
  if (!user) redirect(`/${locale}/login`);
  if (
    getPrimaryRoleCode(user) !== 'STUDENT' ||
    !hasPermission(user, studentPermissions[section], ['S'])
  )
    return <OverviewUnavailable />;
  return (
    <Suspense
      fallback={
        <p role="status" className="p-8">
          {getAcademyCopy(locale).loading}
        </p>
      }
    >
      <StudentPage section={section} user={user} />
    </Suspense>
  );
}
