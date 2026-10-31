'use client';
import type { DataColumn } from '@academyops/ui';

import { useQuery } from '@tanstack/react-query';
import { Book1, Calendar1, Receipt, TickCircle, Wallet2 } from 'iconsax-react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  type AcademyRecord,
  resourceStatuses as academyStatuses,
  field,
  textValue,
} from '@/api/academy/models';
import {
  getStudentPage,
  type StudentSection,
  studentKey,
  studentResource,
  studentRow,
} from '@/api/student/queries';

import { Button } from '@/components/base/buttons/button';

import { formatAcademyDateTime } from '@/features/academy/academy-ui';

import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { hasPermission } from '@/features/dashboard/navigation';
import { useViewMode } from '@/features/dashboard/view-preference';
import { resourceStatuses } from '@/features/management/config';
import { ManagementStatus, ManagementValue } from '@/features/management/presentation';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { managementText } from '@/i18n/management-copy';
import { studentText } from '@/i18n/student-copy';
import { useDocumentLocale } from '@/i18n/use-document-locale';

const icons = {
  learning: Book1,
  schedule: Calendar1,
  attendance: TickCircle,
  finance: Wallet2,
  certificates: Receipt,
};
export function useStudentPageState({
  section,
  user,
}: {
  section: StudentSection;
  user: DashboardUser;
}) {
  const locale = useDocumentLocale();
  const copy = getAcademyCopy(locale);
  const t = (key: Parameters<typeof studentText>[1]) => studentText(locale, key);
  const params = useSearchParams();
  const pathname = usePathname();
  const resource = studentResource(section, params.get('tab'));
  const cursor = params.get('cursor') || undefined;
  const status = params.get('status') || undefined;
  const from = resource === 'sessions' ? params.get('from') || undefined : undefined;
  const to = resource === 'sessions' ? params.get('to') || undefined : undefined;
  const validDate = (value: string | undefined) =>
    !value ||
    (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
  const invalidDates = !validDate(from) || !validDate(to) || Boolean(from && to && from > to);
  const hasFilters = Boolean(status || from || to);
  const filters = {
    ...(cursor ? { cursor } : {}),
    ...(status ? { status } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
  const permitted = hasPermission(
    user,
    resource === 'enrollments'
      ? 'enrollments.read'
      : resource === 'sessions'
        ? 'academic.catalog.read'
        : `${resource}.read`,
    ['S'],
  );
  const list = useQuery({
    queryKey: [...studentKey(user.id), 'list', resource, filters],
    queryFn: ({ signal }) => getStudentPage(resource, filters, signal),
    enabled: permitted && !invalidDates,
  });
  const [view, setView] = useViewMode(params.get('view'));
  const update = (changes: Record<string, string | undefined>, reset = false) => {
    if (changes.view === 'table' || changes.view === 'grid') {
      setView(changes.view);
    }
    const next = new URLSearchParams(params.toString());
    if (reset)
      for (const key of ['cursor', 'trail', 'page', 'record', 'sessionId']) next.delete(key);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    window.history.pushState(null, '', `${pathname}${next.size ? `?${next}` : ''}`);
  };
  const inspect = (row: AcademyRecord) => update({ record: row.id });
  const selectedId =
    params.get('record') || (section === 'attendance' ? params.get('sessionId') : null);
  const selected = selectedId
    ? (list.data?.items.find(({ id }) => id === selectedId) ?? studentRow(selectedId))
    : undefined;
  const states =
    resource === 'enrollments' ? academyStatuses.enrollments : resourceStatuses[resource];
  const close = () => update({ record: undefined, sessionId: undefined });
  const columns: DataColumn<AcademyRecord>[] = [
    {
      id: 'name',
      header: resource === 'enrollments' ? t('course') : managementText(locale, 'name'),
      cell: (row) => (
        <Button
          variant="ghost"
          className="h-auto max-w-full whitespace-normal text-start"
          onClick={() => inspect(row)}
        >
          {row.name}
        </Button>
      ),
    },
    ...(resource === 'enrollments'
      ? [
          {
            id: 'cohort',
            header: copy.cohortId,
            cell: (row: AcademyRecord) => textValue(field(row.data, 'cohort.name')) || copy.none,
          },
        ]
      : resource === 'sessions'
        ? [
            {
              id: 'startsAt',
              header: managementText(locale, 'startsAt'),
              cell: (row: AcademyRecord) =>
                formatAcademyDateTime(row.data.startsAt, locale, copy.none),
            },
            {
              id: 'endsAt',
              header: managementText(locale, 'endsAt'),
              cell: (row: AcademyRecord) =>
                formatAcademyDateTime(row.data.endsAt, locale, copy.none),
            },
            {
              id: 'room',
              header: managementText(locale, 'room.name'),
              cell: (row: AcademyRecord) =>
                textValue(field(row.data, 'room.name')) ||
                managementText(locale, textValue(row.data.deliveryMode)),
            },
          ]
        : resource === 'certificates'
          ? [
              {
                id: 'pdfStatus',
                header: managementText(locale, 'pdfStatus'),
                cell: (row: AcademyRecord) => managementText(locale, textValue(row.data.pdfStatus)),
              },
              {
                id: 'issuedAt',
                header: managementText(locale, 'issuedAt'),
                cell: (row: AcademyRecord) =>
                  formatAcademyDateTime(row.data.issuedAt, locale, copy.none),
              },
            ]
          : [
              {
                id: 'amount',
                header: t('amount'),
                cell: (row: AcademyRecord) => (
                  <ManagementValue
                    data={row.data}
                    name={resource === 'invoices' ? 'totalAmount' : 'amount'}
                    locale={locale}
                  />
                ),
              },
            ]),
    {
      id: 'status',
      header: copy.status,
      cell: (row) => <ManagementStatus value={row.status} locale={locale} />,
    },
  ];
  const Icon = icons[section];
  const tabItems =
    section === 'finance'
      ? [
          { id: 'enrollments', label: t('installments'), permission: 'enrollments.read' },
          ...(['payments', 'invoices', 'receipts'] as const).map((id) => ({
            id,
            label: t(id),
            permission: `${id}.read`,
          })),
        ].filter(({ permission }) => hasPermission(user, permission, ['S']))
      : [{ id: resource, label: t(section) }];
  const trail = params.get('trail')?.split('~') ?? [];
  const rawPage = Number(params.get('page'));
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const resetFilters = () => update({ status: undefined, from: undefined, to: undefined }, true);
  return {
    section,
    user,
    locale,
    copy,
    t,
    resource,
    cursor,
    status,
    from,
    to,
    invalidDates,
    hasFilters,
    filters,
    permitted,
    list,
    update,
    inspect,
    selected,
    view,
    states,
    close,
    columns,
    Icon,
    tabItems,
    trail,
    page,
    resetFilters,
  };
}
