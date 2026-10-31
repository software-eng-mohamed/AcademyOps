'use client';

import type { DataColumn } from '@academyops/ui';
import { AnimatedNumber } from '@academyops/ui/academy';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@academyops/ui/registry';
import { SearchNormal1 } from 'iconsax-react';
import type { ReactNode } from 'react';
import { type AcademyRecord, type AcademyResource, field } from '@/api/academy/models';
import { Button } from '@/components/base/buttons/button';
import type { AcademyCopy } from '@/i18n/academy-copy';
import type { Locale } from '@/lib/locales';
import styles from './academy-styles';
import { DirectoryAvatar, DirectoryCard } from './academy-surfaces';
import { AcademyTable } from './academy-table';
import { StatusPill } from './academy-ui';
import { AcademyIcon } from './academy-workspace';
import { CohortIntakeProgress, CohortStatus } from './cohort-intake';

export function RecordAvatar({
  row,
  resource,
  large = false,
}: {
  row: AcademyRecord;
  resource: AcademyResource;
  large?: boolean;
}) {
  const personal = ['students', 'leads', 'registrations', 'enrollments', 'trainers'].includes(
    resource,
  );
  return (
    <DirectoryAvatar
      large={large}
      {...(personal ? { name: row.name } : {})}
      icon={<AcademyIcon resource={resource} className={large ? 'size-6' : 'size-4'} />}
    />
  );
}

export function AcademyRecords({
  rows,
  columns,
  resource,
  copy,
  view,
  busy,
  onInspect,
  locale = 'en',
  renderStatus,
  renderAvatar,
}: {
  rows: AcademyRecord[];
  columns: DataColumn<AcademyRecord>[];
  resource: AcademyResource;
  copy: AcademyCopy;
  view: 'grid' | 'table';
  busy: boolean;
  onInspect: (row: AcademyRecord) => void;
  locale?: Locale;
  renderStatus?: (row: AcademyRecord) => ReactNode;
  renderAvatar?: (row: AcademyRecord) => ReactNode;
}) {
  if (view === 'grid')
    return (
      <div className={styles.recordGrid} aria-busy={busy}>
        {rows.map((row) => {
          return (
            <DirectoryCard
              key={row.id}
              resource={resource}
              name={row.name || copy.none}
              code={row.code}
              avatar={
                renderAvatar ? (
                  renderAvatar(row)
                ) : (
                  <RecordAvatar row={row} resource={resource} large />
                )
              }
              status={
                renderStatus ? (
                  renderStatus(row)
                ) : resource === 'cohorts' ? (
                  <CohortStatus row={row} copy={copy} />
                ) : row.status ? (
                  <StatusPill status={row.status} copy={copy} />
                ) : null
              }
              onInspect={() => onInspect(row)}
              viewLabel={copy.view}
            >
              <dl className={styles.cardFacts}>
                {columns
                  .filter(
                    (column) =>
                      !['name', 'status', 'actions'].includes(column.id) &&
                      !(column.id === 'code' && row.code),
                  )
                  .map((column) => {
                    const value =
                      column.id === 'versions' && Array.isArray(row.data.versions)
                        ? row.data.versions.length
                        : column.id === 'enrollmentCount'
                          ? field(row.data, 'enrollmentSummary.total')
                          : row.data[column.id];
                    const numeric =
                      [
                        'capacity',
                        'scheduledSessions',
                        'cohortCount',
                        'learnerCount',
                        'confirmedEnrollmentCount',
                        'pendingEnrollmentCount',
                        'postponedEnrollmentCount',
                        'remainingEnrollmentCount',
                        'enrollmentCount',
                        'versions',
                      ].includes(column.id) &&
                      typeof value === 'number' &&
                      Number.isFinite(value);
                    return (
                      <div key={column.id}>
                        <dt>{column.header}</dt>
                        <dd className={numeric ? styles.cardNumber : undefined}>
                          {numeric ? (
                            <AnimatedNumber
                              value={value}
                              format={(number) => Math.round(number).toLocaleString(locale)}
                            />
                          ) : (
                            column.cell(row)
                          )}
                        </dd>
                      </div>
                    );
                  })}
              </dl>
              {resource === 'cohorts' ? <CohortIntakeProgress row={row} copy={copy} /> : null}
            </DirectoryCard>
          );
        })}
      </div>
    );
  return <AcademyTable rows={rows} columns={columns} label={copy.directory} busy={busy} />;
}

export function AcademyLoading({ label }: { label: string }) {
  return (
    <div
      className="my-2 overflow-hidden rounded-xl border border-border-secondary bg-background-primary-default p-4 shadow-xs animate-pulse"
      role="status"
      aria-label={label}
    >
      <div className="mb-4 flex items-center justify-between border-b border-border-secondary pb-3">
        <div className="flex items-center gap-3">
          <div className="h-4 w-32 rounded bg-background-secondary-default" />
          <div className="h-4 w-20 rounded bg-background-secondary-default/60" />
        </div>
        <div className="h-4 w-16 rounded bg-background-secondary-default/50" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((key) => (
          <div
            key={key}
            className="flex items-center justify-between gap-4 border-b border-border-secondary/60 py-2.5 last:border-b-0"
            aria-hidden
          >
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-xl bg-background-secondary-default" />
              <div className="flex flex-col gap-1.5">
                <div className="h-3.5 w-36 rounded bg-background-secondary-default" />
                <div className="h-2.5 w-24 rounded bg-background-secondary-default/60" />
              </div>
            </div>
            <div className="hidden h-3.5 w-28 rounded bg-background-secondary-default/70 sm:block" />
            <div className="hidden h-3.5 w-20 rounded bg-background-secondary-default/70 md:block" />
            <div className="h-7 w-20 rounded-lg bg-background-secondary-default" />
          </div>
        ))}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function AcademyEmpty({
  copy,
  onCreate,
  onReset,
}: {
  copy: AcademyCopy;
  onCreate?: () => void;
  onReset?: () => void;
}) {
  return (
    <Empty
      className="my-3 min-h-72 rounded-2xl border border-dashed border-border-secondary bg-background-primary-default p-8 shadow-xs"
      data-library-component="shadcn/empty"
    >
      <EmptyHeader className="gap-3">
        <EmptyMedia
          variant="icon"
          className="size-12 rounded-xl border border-accent-500/20 bg-accent-500/10 text-accent-500 shadow-xs"
        >
          <SearchNormal1 aria-hidden color="currentColor" size={24} />
        </EmptyMedia>
        <EmptyTitle
          role="heading"
          aria-level={2}
          className="text-base sm:text-lg font-semibold text-text-primary"
        >
          {copy.noResults}
        </EmptyTitle>
        <EmptyDescription className="max-w-md text-xs sm:text-sm leading-relaxed text-text-secondary">
          {onCreate ? copy.noResultsDescription : copy.noResultsReadOnly}
        </EmptyDescription>
      </EmptyHeader>
      {onReset || onCreate ? (
        <EmptyContent className="mt-1">
          <Button
            type="button"
            variant={onReset ? 'secondary' : 'primary'}
            onClick={onReset ?? onCreate}
          >
            {onReset ? copy.reset : copy.add}
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
