'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { createAttendancePolicy, readAttendancePolicies } from '@/api/management/attendance';
import { managementKey } from '@/api/management/queries';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import styles from '@/features/academy/academy-detail-styles';
import { AcademyTable } from '@/features/academy/academy-table';
import { ErrorNotice, formatAcademyDateTime } from '@/features/academy/academy-ui';
import { SystemCommandDialog } from '@/features/system/command-dialog';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { operationsText } from '@/i18n/operations-copy';
import type { Locale } from '@/lib/locales';
import { type AttendancePolicyValues, validAttendancePolicy } from './attendance-policy-values';

export function AttendancePolicies({
  programVersionId,
  cohortId,
  locale,
  userId,
}: {
  programVersionId: string;
  cohortId?: string;
  locale: Locale;
  userId: string;
}) {
  const [editing, setEditing] = useState(false);
  const copy = getAcademyCopy(locale);
  const query = useQuery({
    queryKey: [...managementKey(userId), 'attendance-policies', programVersionId, cohortId],
    queryFn: ({ signal }) => readAttendancePolicies(programVersionId, cohortId, signal),
  });
  const rows = (query.data ?? []).filter((item) =>
    cohortId ? item.cohortId === cohortId : item.cohortId === null,
  );
  return (
    <section className={styles.detailSection}>
      <h3>{operationsText(locale, 'policies')}</h3>
      <p className="mb-3 text-sm text-ink-muted">
        {operationsText(locale, cohortId ? 'cohortPolicy' : 'defaultPolicy')}
      </p>
      {query.isPending ? (
        <p role="status">{copy.loading}</p>
      ) : query.isError ? (
        <ErrorNotice error={query.error} copy={copy} retry={() => void query.refetch()} />
      ) : rows.length ? (
        <AcademyTable
          rows={rows}
          label={operationsText(locale, 'policies')}
          busy={query.isFetching}
          columns={[
            { id: 'version', header: copy.version, cell: (row) => row.version },
            {
              id: 'minimum',
              header: operationsText(locale, 'minimum'),
              cell: (row) =>
                new Intl.NumberFormat(locale, {
                  style: 'percent',
                  maximumFractionDigits: 2,
                }).format(Number(row.minimumRatio)),
            },
            {
              id: 'lock',
              header: operationsText(locale, 'lockAfterMinutes'),
              cell: (row) => row.lockAfterMinutes,
            },
            {
              id: 'opens',
              header: operationsText(locale, 'checkInOpensBeforeMinutes'),
              cell: (row) => row.checkInOpensBeforeMinutes,
            },
            {
              id: 'closes',
              header: operationsText(locale, 'checkInClosesAfterMinutes'),
              cell: (row) => row.checkInClosesAfterMinutes,
            },
            {
              id: 'from',
              header: operationsText(locale, 'effectiveFrom'),
              cell: (row) => formatAcademyDateTime(row.effectiveFrom, locale, copy.none),
            },
            {
              id: 'to',
              header: operationsText(locale, 'effectiveTo'),
              cell: (row) => formatAcademyDateTime(row.effectiveTo, locale, copy.none),
            },
          ]}
        />
      ) : (
        <p className="text-sm text-ink-muted">{operationsText(locale, 'policyFallback')}</p>
      )}
      {(query.data?.length ?? 0) >= 500 ? <p>{operationsText(locale, 'resultsLimited')}</p> : null}
      <div className="mt-4">
        <Button variant="secondary" onClick={() => setEditing(true)}>
          {operationsText(locale, 'newPolicy')}
        </Button>
      </div>
      {editing ? (
        <PolicyDialog
          programVersionId={programVersionId}
          {...(cohortId ? { cohortId } : {})}
          userId={userId}
          locale={locale}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </section>
  );
}
function PolicyDialog({
  programVersionId,
  cohortId,
  userId,
  locale,
  onClose,
}: {
  programVersionId: string;
  cohortId?: string;
  userId: string;
  locale: Locale;
  onClose: () => void;
}) {
  const [values, setValues] = useState<AttendancePolicyValues>({
    minimumPercent: '80',
    lockAfterMinutes: '1440',
    checkInOpensBeforeMinutes: '30',
    checkInClosesAfterMinutes: '30',
    effectiveFrom: '',
    effectiveTo: '',
  });
  const [invalid, setInvalid] = useState(false);
  const client = useQueryClient();
  return (
    <SystemCommandDialog
      title={operationsText(locale, 'newPolicy')}
      description={operationsText(locale, 'policyHint')}
      userId={userId}
      locale={locale}
      fingerprint={JSON.stringify({ programVersionId, cohortId, values })}
      validate={() => {
        const valid = validAttendancePolicy(values);
        setInvalid(!valid);
        return valid;
      }}
      submit={(key) =>
        createAttendancePolicy(
          {
            programVersionId,
            ...(cohortId ? { cohortId } : {}),
            minimumRatio: Number(values.minimumPercent) / 100,
            lockAfterMinutes: Number(values.lockAfterMinutes),
            checkInOpensBeforeMinutes: Number(values.checkInOpensBeforeMinutes),
            checkInClosesAfterMinutes: Number(values.checkInClosesAfterMinutes),
            effectiveFrom: new Date(values.effectiveFrom).toISOString(),
            ...(values.effectiveTo
              ? { effectiveTo: new Date(values.effectiveTo).toISOString() }
              : {}),
          },
          key,
        )
      }
      onSaved={() => client.invalidateQueries({ queryKey: managementKey(userId) })}
      onClose={onClose}
    >
      {(Object.keys(values) as Array<keyof AttendancePolicyValues>).map((key) => (
        <Input
          key={key}
          label={operationsText(locale, key)}
          type={key.startsWith('effective') ? 'datetime-local' : 'text'}
          inputMode={key.startsWith('effective') ? 'text' : 'decimal'}
          value={values[key]}
          onChange={(value) => setValues((previous) => ({ ...previous, [key]: value }))}
          isInvalid={invalid && !validAttendancePolicy(values)}
        />
      ))}
      {invalid ? (
        <p role="alert" className="text-sm text-danger">
          {operationsText(locale, 'policyInvalid')}
        </p>
      ) : null}
    </SystemCommandDialog>
  );
}
