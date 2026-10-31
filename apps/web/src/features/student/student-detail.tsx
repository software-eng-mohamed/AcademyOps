'use client';
import {
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@academyops/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { type AcademyRecord, field, record, records, textValue } from '@/api/academy/models';
import { getAcademyDetail } from '@/api/academy/queries';
import { programVersionsControllerReadV1 } from '@/api/generated/academic-catalog/academic-catalog';
import { certificatesControllerEligibilityV1 } from '@/api/generated/certificates/certificates';
import { getManagementDetail, managementRow } from '@/api/management/queries';
import { getStudentRoster, type StudentSection, studentKey } from '@/api/student/queries';
import { Button, ButtonLink } from '@/components/base/buttons/button';
import styles from '@/features/academy/academy-styles';
import { ErrorNotice } from '@/features/academy/academy-ui';
import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { hasPermission } from '@/features/dashboard/navigation';
import {
  AttendanceRecordPanel,
  EnrollmentAttendanceSummary,
} from '@/features/management/attendance-record';
import { ManagementFacts, ManagementStatus } from '@/features/management/presentation';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { managementText } from '@/i18n/management-copy';
import { studentText } from '@/i18n/student-copy';
import type { Locale } from '@/lib/locales';
import { StudentFinance } from './student-finance';

export function StudentDetail({
  resource,
  section,
  row,
  user,
  locale,
  onClose,
}: {
  resource: 'enrollments' | 'sessions';
  section: StudentSection;
  row: AcademyRecord;
  user: DashboardUser;
  locale: Locale;
  onClose: () => void;
}) {
  const copy = getAcademyCopy(locale);
  const query = useQuery({
    queryKey: [...studentKey(user.id), 'detail', resource, row.id],
    queryFn: ({ signal }) =>
      resource === 'enrollments'
        ? getAcademyDetail(resource, row, signal)
        : getManagementDetail(resource, row, signal),
  });
  const detail = query.data;
  const title =
    resource === 'enrollments'
      ? textValue(field(detail?.data ?? {}, 'program.name')) || row.name
      : detail?.name || row.name;
  return (
    <Drawer
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DrawerContent className={styles.drawer} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        <DrawerHeader>
          <div>
            <DrawerDescription className="mb-2">{studentText(locale, section)}</DrawerDescription>
            <DrawerTitle className={styles.drawerTitle}>{title || copy.details}</DrawerTitle>
            {detail?.status ? (
              <div className="mt-3">
                <ManagementStatus locale={locale} value={detail.status} />
              </div>
            ) : null}
          </div>
          <DrawerCloseButton aria-label={copy.close} />
        </DrawerHeader>
        <DrawerBody>
          {query.isPending ? (
            <p role="status">{copy.loading}</p>
          ) : query.isError ? (
            <ErrorNotice error={query.error} copy={copy} retry={() => void query.refetch()} />
          ) : detail ? (
            <>
              <ManagementFacts
                data={detail.data}
                names={
                  resource === 'sessions'
                    ? [
                        'cohort.name',
                        'module.name',
                        'startsAt',
                        'endsAt',
                        'deliveryMode',
                        'room.name',
                      ]
                    : ['program.name', 'cohort.name', 'kind', 'activatedAt', 'completedAt']
                }
                locale={locale}
              />
              {resource === 'enrollments' ? (
                section === 'finance' && hasPermission(user, 'finance.balance.read', ['S']) ? (
                  <StudentFinance enrollmentId={row.id} user={user} locale={locale} />
                ) : (
                  <>
                    {hasPermission(user, 'attendance.read', ['S']) ? (
                      <EnrollmentAttendanceSummary
                        enrollmentId={row.id}
                        userId={user.id}
                        locale={locale}
                      />
                    ) : null}
                    {hasPermission(user, 'academic.catalog.read', ['S']) &&
                    detail.data.programVersionId ? (
                      <Curriculum
                        id={textValue(detail.data.programVersionId)}
                        userId={user.id}
                        locale={locale}
                      />
                    ) : null}
                    {hasPermission(user, 'certificates.read', ['S']) ? (
                      <Eligibility id={row.id} userId={user.id} locale={locale} />
                    ) : null}
                    <div className="mt-6 flex flex-wrap gap-2">
                      {hasPermission(user, 'finance.balance.read', ['S']) ? (
                        <ButtonLink
                          variant="secondary"
                          href={`/${locale}/finance?record=${encodeURIComponent(row.id)}`}
                        >
                          {studentText(locale, 'finance')}
                        </ButtonLink>
                      ) : null}
                      {hasPermission(user, 'academic.catalog.read', ['S']) ? (
                        <ButtonLink variant="secondary" href={`/${locale}/schedule`}>
                          {studentText(locale, 'schedule')}
                        </ButtonLink>
                      ) : null}
                    </div>
                  </>
                )
              ) : section === 'attendance' ? (
                <OwnAttendance id={row.id} user={user} locale={locale} />
              ) : hasPermission(user, 'attendance.read', ['S']) ? (
                <div className="mt-5">
                  <ButtonLink
                    variant="secondary"
                    href={`/${locale}/attendance?sessionId=${encodeURIComponent(row.id)}`}
                  >
                    {studentText(locale, 'attendance')}
                  </ButtonLink>
                </div>
              ) : null}
            </>
          ) : null}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
function Curriculum({ id, userId, locale }: { id: string; userId: string; locale: Locale }) {
  const copy = getAcademyCopy(locale);
  const query = useQuery({
    queryKey: [...studentKey(userId), 'curriculum', id],
    queryFn: ({ signal }) => programVersionsControllerReadV1(id, { signal }),
  });
  return (
    <section className={styles.detailSection}>
      <h3>{studentText(locale, 'curriculum')}</h3>
      {query.isError ? (
        <ErrorNotice error={query.error} copy={copy} retry={() => void query.refetch()} />
      ) : query.isPending ? (
        <p role="status">{copy.loading}</p>
      ) : (
        <div className={styles.related}>
          {!records(record(query.data.data).modules).length ? <p>{copy.empty}</p> : null}
          {records(record(query.data.data).modules).map((item) => (
            <div className={styles.relatedItem} key={textValue(item.id)}>
              <strong>
                {textValue(item.ordinal)}. {textValue(field(item, 'module.name'))}
              </strong>
              {item.required ? <small>{copy.requiredModule}</small> : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
function Eligibility({ id, userId, locale }: { id: string; userId: string; locale: Locale }) {
  const copy = getAcademyCopy(locale);
  const t = (key: Parameters<typeof studentText>[1]) => studentText(locale, key);
  const query = useQuery({
    queryKey: [...studentKey(userId), 'eligibility', id],
    queryFn: ({ signal }) => certificatesControllerEligibilityV1(id, { signal }),
  });
  const data = query.data?.data;
  return (
    <section className={styles.detailSection}>
      <h3>{t('eligibility')}</h3>
      {query.isError ? (
        <ErrorNotice error={query.error} copy={copy} retry={() => void query.refetch()} />
      ) : query.isPending ? (
        <p role="status">{copy.loading}</p>
      ) : data ? (
        <dl className={styles.facts}>
          <div>
            <dt>{t('eligibility')}</dt>
            <dd>{t(data.overallEligibility ? 'eligible' : 'ineligible')}</dd>
          </div>
          <div>
            <dt>{t('completed')}</dt>
            <dd>{managementText(locale, data.completionSatisfied ? 'yes' : 'no')}</dd>
          </div>
          <div>
            <dt>{t('financialHold')}</dt>
            <dd>{managementText(locale, data.financialHold ? 'yes' : 'no')}</dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}
function OwnAttendance({ id, user, locale }: { id: string; user: DashboardUser; locale: Locale }) {
  const copy = getAcademyCopy(locale);
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors.at(-1);
  const query = useQuery({
    queryKey: [...studentKey(user.id), 'attendance', id, cursor],
    queryFn: ({ signal }) => getStudentRoster(id, signal, cursor),
  });
  return (
    <section className={styles.detailSection}>
      <h3>{studentText(locale, 'attendance')}</h3>
      {query.isError ? (
        <ErrorNotice error={query.error} copy={copy} retry={() => void query.refetch()} />
      ) : query.isPending ? (
        <p role="status">{copy.loading}</p>
      ) : !query.data.items.length ? (
        <p>{studentText(locale, 'noAttendance')}</p>
      ) : (
        query.data.items.map((item) => (
          <div key={item.enrollmentId}>
            {item.attendance ? (
              <ManagementStatus value={item.effectiveStatus} locale={locale} />
            ) : (
              <p>{studentText(locale, 'noAttendance')}</p>
            )}
            <AttendanceRecordPanel
              row={managementRow('roster', { ...item, session: query.data.session })}
              user={user}
              locale={locale}
            />
          </div>
        ))
      )}
      {cursors.length || query.data?.nextCursor ? (
        <div className="mt-4 flex gap-3">
          <Button
            variant="secondary"
            disabled={!cursors.length || query.isFetching}
            onClick={() => setCursors((old) => old.slice(0, -1))}
          >
            {copy.previous}
          </Button>
          <Button
            variant="secondary"
            disabled={!query.data?.nextCursor || query.isFetching}
            onClick={() => {
              const next = query.data?.nextCursor;
              if (next) setCursors((old) => [...old, next]);
            }}
          >
            {copy.next}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
