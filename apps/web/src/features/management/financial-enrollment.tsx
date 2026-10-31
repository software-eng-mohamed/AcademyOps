'use client';

import { useQuery } from '@tanstack/react-query';
import { academyKey } from '@/api/academy/queries';
import { enrollmentControllerReadV1 } from '@/api/generated/enrollment/enrollment';
import { ButtonLink } from '@/components/base/buttons/button';
import styles from '@/features/academy/academy-detail-styles';
import { ErrorNotice } from '@/features/academy/academy-ui';
import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { hasStaffPermission } from '@/features/dashboard/navigation';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { managementText } from '@/i18n/management-copy';
import type { Locale } from '@/lib/locales';
import { ManagementFacts } from './presentation';

// Resolve the enrollment only for the open financial record, using the existing
// scoped endpoint. Do not fan out profile requests for every table row.
export function FinancialEnrollment({
  enrollmentId,
  user,
  locale,
}: {
  enrollmentId: string;
  user: DashboardUser;
  locale: Locale;
}) {
  const allowed = Boolean(enrollmentId) && hasStaffPermission(user, 'enrollments.read');
  const query = useQuery({
    queryKey: [...academyKey(user.id), 'financialEnrollment', enrollmentId],
    queryFn: async ({ signal }) =>
      (await enrollmentControllerReadV1(enrollmentId, { signal })).data,
    enabled: allowed,
  });
  const copy = getAcademyCopy(locale);
  if (!allowed) return null;
  return (
    <section className={styles.detailSection}>
      <h3>{managementText(locale, 'enrollmentId')}</h3>
      {query.isPending ? (
        <p role="status">{copy.loading}</p>
      ) : query.isError ? (
        <ErrorNotice error={query.error} copy={copy} retry={() => void query.refetch()} />
      ) : (
        <>
          <ManagementFacts
            data={{ ...query.data }}
            names={['student.name', 'program.name', 'cohort.name']}
            locale={locale}
          />
          <ButtonLink
            className="mt-3"
            variant="secondary"
            href={`/${locale}/enrollments?record=${encodeURIComponent(enrollmentId)}`}
          >
            {managementText(locale, 'openEnrollment')}
          </ButtonLink>
        </>
      )}
    </section>
  );
}
