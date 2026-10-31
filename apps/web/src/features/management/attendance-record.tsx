'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { field, textValue } from '@/api/academy/models';
import {
  createMakeupCredit,
  findSessionAttendance,
  readAttendanceRecord,
  readAttendanceSummary,
} from '@/api/management/attendance';
import { managementKey } from '@/api/management/queries';
import { Button } from '@/components/base/buttons/button';
import styles from '@/features/academy/academy-detail-styles';
import { AcademyTable } from '@/features/academy/academy-table';
import { ErrorNotice, formatAcademyDateTime } from '@/features/academy/academy-ui';
import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { hasPermission, staffScopes } from '@/features/dashboard/navigation';
import { SystemCommandDialog } from '@/features/system/command-dialog';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { managementText } from '@/i18n/management-copy';
import { operationsText } from '@/i18n/operations-copy';
import type { Locale } from '@/lib/locales';
import type { ManagementRow } from './config';
import { ManagementLookup } from './lookup-select';

export function EnrollmentAttendanceSummary({
  enrollmentId,
  userId,
  locale,
}: {
  enrollmentId: string;
  userId: string;
  locale: Locale;
}) {
  const copy = getAcademyCopy(locale);
  const query = useQuery({
    queryKey: [...managementKey(userId), 'attendance-summary', enrollmentId],
    queryFn: ({ signal }) => readAttendanceSummary(enrollmentId, signal),
  });
  const data = query.data;
  const percent = (value: string) =>
    new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 }).format(
      Number(value),
    );
  return (
    <section className={styles.detailSection}>
      <h3>{operationsText(locale, 'summary')}</h3>
      {query.isPending ? (
        <p role="status">{copy.loading}</p>
      ) : query.isError ? (
        <ErrorNotice error={query.error} copy={copy} retry={() => void query.refetch()} />
      ) : data ? (
        <dl className={styles.facts}>
          <div>
            <dt>{operationsText(locale, 'ratio')}</dt>
            <dd>{data.ratio === null ? copy.none : percent(data.ratio)}</dd>
          </div>
          <div>
            <dt>{operationsText(locale, 'minimum')}</dt>
            <dd>{percent(data.minimumRatio)}</dd>
          </div>
          <div>
            <dt>{operationsText(locale, 'numerator')}</dt>
            <dd>{data.numerator}</dd>
          </div>
          <div>
            <dt>{operationsText(locale, 'denominator')}</dt>
            <dd>{data.denominator}</dd>
          </div>
          <div>
            <dt>{operationsText(locale, 'makeupCount')}</dt>
            <dd>{data.makeupCredits}</dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}
export function AttendanceRecordPanel({
  row,
  user,
  locale,
}: {
  row: ManagementRow;
  user: DashboardUser;
  locale: Locale;
}) {
  const copy = getAcademyCopy(locale);
  const id = textValue(field(row.data, 'attendance.id'));
  const [makeup, setMakeup] = useState(false);
  const query = useQuery({
    queryKey: [...managementKey(user.id), 'attendance-record', id],
    queryFn: ({ signal }) => readAttendanceRecord(id, signal),
    enabled: Boolean(id),
  });
  const data = query.data;
  return (
    <>
      <EnrollmentAttendanceSummary
        enrollmentId={textValue(row.data.enrollmentId)}
        userId={user.id}
        locale={locale}
      />
      {id ? (
        <section className={styles.detailSection}>
          <h3>{operationsText(locale, 'history')}</h3>
          {query.isPending ? (
            <p role="status">{copy.loading}</p>
          ) : query.isError ? (
            <ErrorNotice error={query.error} copy={copy} retry={() => void query.refetch()} />
          ) : data ? (
            <>
              <AcademyTable
                label={operationsText(locale, 'history')}
                rows={data.events}
                busy={query.isFetching}
                columns={[
                  { id: 'version', header: copy.version, cell: (event) => event.version },
                  {
                    id: 'status',
                    header: managementText(locale, 'status'),
                    cell: (event) => managementText(locale, event.toStatus),
                  },
                  {
                    id: 'reason',
                    header: managementText(locale, 'reason'),
                    cell: (event) => event.reason ?? copy.none,
                  },
                  {
                    id: 'at',
                    header: managementText(locale, 'occurredAt'),
                    cell: (event) => formatAcademyDateTime(event.occurredAt, locale, copy.none),
                  },
                ]}
              />
              {data.makeup.compensatedByRecordId ? (
                <p className="mt-4 text-sm text-ink-muted">
                  {operationsText(locale, 'compensated')}
                </p>
              ) : data.currentStatus === 'ABSENT' &&
                hasPermission(user, 'attendance.correct_after_lock', staffScopes(user)) ? (
                <Button variant="secondary" onClick={() => setMakeup(true)}>
                  {operationsText(locale, 'makeup')}
                </Button>
              ) : null}
              {makeup ? (
                <MakeupDialog
                  missedId={id}
                  enrollmentId={data.enrollmentId}
                  missedSessionId={data.sessionId}
                  userId={user.id}
                  locale={locale}
                  onClose={() => setMakeup(false)}
                />
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
function MakeupDialog({
  missedId,
  missedSessionId,
  enrollmentId,
  userId,
  locale,
  onClose,
}: {
  missedId: string;
  missedSessionId: string;
  enrollmentId: string;
  userId: string;
  locale: Locale;
  onClose: () => void;
}) {
  const [sessionId, setSessionId] = useState('');
  const copy = getAcademyCopy(locale);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: [...managementKey(userId), 'makeup-candidate', sessionId, enrollmentId],
    queryFn: ({ signal }) => findSessionAttendance(sessionId, enrollmentId, signal),
    enabled: Boolean(sessionId) && sessionId !== missedSessionId,
  });
  const candidate = query.data;
  const valid = Boolean(
    candidate && ['PRESENT', 'LATE'].includes(candidate.status) && sessionId !== missedSessionId,
  );
  return (
    <SystemCommandDialog
      title={operationsText(locale, 'makeup')}
      description={operationsText(locale, 'makeupHint')}
      userId={userId}
      locale={locale}
      fingerprint={JSON.stringify({ missedId, makeupId: candidate?.id })}
      validate={() => valid}
      submit={(key) => createMakeupCredit(missedId, valid ? (candidate?.id ?? '') : '', key)}
      onSaved={() => client.invalidateQueries({ queryKey: managementKey(userId) })}
      onClose={onClose}
    >
      <ManagementLookup
        name="sessionId"
        kind="sessions"
        values={{ sessionId }}
        onChange={setSessionId}
        userId={userId}
        locale={locale}
        required
      />
      {sessionId ? (
        query.isFetching ? (
          <p role="status">{copy.loading}</p>
        ) : query.isError ? (
          <ErrorNotice error={query.error} copy={copy} retry={() => void query.refetch()} />
        ) : valid && candidate ? (
          <p>
            {operationsText(locale, 'makeupRecord')}: {managementText(locale, candidate.status)} ·{' '}
            {formatAcademyDateTime(candidate.recordedAt, locale, copy.none)}
          </p>
        ) : (
          <p role="status">{operationsText(locale, 'noCandidate')}</p>
        )
      ) : null}
    </SystemCommandDialog>
  );
}
