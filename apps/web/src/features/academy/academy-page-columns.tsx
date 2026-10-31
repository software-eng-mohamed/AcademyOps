'use client';

import type { DataColumn } from '@academyops/ui';
import { ArrowRight2 } from 'iconsax-react';
import {
  type AcademyRecord,
  type AcademyResource,
  field,
  record,
  textValue,
} from '@/api/academy/models';
import { academyLabel } from '@/i18n/academy-copy';
import { RecordAvatar } from './academy-records';
import { formatAcademyDate, formatAcademyDateTime, StatusPill } from './academy-ui';
import { CohortStatus } from './cohort-intake';

import type { AcademyPageModel } from './use-academy-page';

const columns: Partial<Record<AcademyResource, string[]>> = {
  leads: ['stageId', 'assignedUserId', 'nextActionAt'],
  students: ['program', 'currentGroup', 'enrollmentCount'],
  registrations: ['email', 'phone', 'submittedAt'],
  enrollments: ['program', 'currentGroup', 'kind'],
  programs: ['versions', 'createdAt'],
  cohorts: [
    'capacity',
    'confirmedEnrollmentCount',
    'pendingEnrollmentCount',
    'remainingEnrollmentCount',
    'startsOn',
    'endsOn',
  ],
  rooms: ['capacity', 'scheduledSessions'],
  trainers: ['scheduledSessions', 'cohortCount'],
  modules: ['code', 'createdAt'],
  stages: ['ordinal'],
};

export function getAcademyPageColumns(model: AcademyPageModel) {
  const { user, locale, copy, resource, assignees, inspect } = model;
  const tableColumns: DataColumn<AcademyRecord>[] = [
    {
      id: 'name',
      header: ['students', 'enrollments'].includes(resource)
        ? copy.studentName
        : ['leads', 'registrations', 'trainers'].includes(resource)
          ? copy.personName
          : copy.name,
      cell: (row) => (
        <button
          className="rounded-md text-start hover:text-brand"
          type="button"
          onClick={() => inspect(row)}
        >
          <span className="flex items-center gap-2.5">
            <RecordAvatar row={row} resource={resource} />
            <span className="grid min-w-0 gap-1">
              <strong className="text-sm leading-tight font-medium">{row.name || copy.none}</strong>
              {row.code && row.code !== row.name ? (
                <small className="text-xs text-ink-muted" dir="ltr">
                  {row.code}
                </small>
              ) : (
                <small className="text-xs text-ink-muted">
                  {formatAcademyDate(row.data.createdAt ?? row.data.submittedAt, locale, copy.none)}
                </small>
              )}
            </span>
          </span>
        </button>
      ),
    },
    ...(columns[resource] ?? []).map(
      (key): DataColumn<AcademyRecord> => ({
        id: key,
        header:
          resource === 'cohorts' && key === 'capacity'
            ? copy.cohortTarget
            : academyLabel(copy, key),
        cell: (row) => {
          if (key === 'stageId') return textValue(record(row.data.stage).name) || copy.none;
          if (key === 'assignedUserId')
            return (
              assignees.data?.find((item) => item.id === row.data.assignedUserId)?.name ||
              (row.data.assignedUserId === user.id
                ? user.name
                : row.data.assignedUserId
                  ? copy.assignedTeamMember
                  : copy.none)
            );
          if (key === 'program')
            return (
              textValue(
                field(row.data, 'program.name') ||
                  field(row.data, 'enrollmentSummary.program.name'),
              ) || copy.none
            );
          if (key === 'currentGroup')
            return (
              textValue(
                field(row.data, 'cohort.name') || field(row.data, 'enrollmentSummary.cohort.name'),
              ) || copy.none
            );
          if (key === 'enrollmentCount')
            return textValue(field(row.data, 'enrollmentSummary.total')) || '0';
          if (key === 'versions')
            return Array.isArray(row.data.versions) ? String(row.data.versions.length) : copy.none;
          if (key === 'kind') return academyLabel(copy, textValue(row.data.kind));
          if (key === 'nextActionAt')
            return formatAcademyDateTime(row.data[key], locale, copy.none);
          if (/At$|On$/.test(key)) return formatAcademyDate(row.data[key], locale, copy.none);
          return (
            <span dir={['phone', 'email', 'code'].includes(key) ? 'ltr' : undefined}>
              {textValue(row.data[key]) || copy.none}
            </span>
          );
        },
      }),
    ),
    ...(resource !== 'students'
      ? [
          {
            id: 'status',
            header: copy.status,
            cell: (row: AcademyRecord) =>
              resource === 'cohorts' ? (
                <CohortStatus row={row} copy={copy} />
              ) : (
                <StatusPill status={row.status} copy={copy} />
              ),
          },
        ]
      : []),
    {
      id: 'actions',
      header: copy.actions,
      cell: (row) => (
        <button
          type="button"
          aria-label={`${copy.view}: ${row.name}`}
          onClick={() => inspect(row)}
          className="inline-flex size-8 items-center justify-center rounded-lg border border-border-secondary bg-background-primary-default text-text-secondary hover:border-border-button-hover hover:bg-background-secondary-default hover:text-text-primary transition-colors shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        >
          <ArrowRight2 aria-hidden color="currentColor" className="size-4 rtl:rotate-180" />
        </button>
      ),
    },
  ];
  return tableColumns;
}
