'use client';
import type { DataColumn } from '@academyops/ui';

import { Button as IconButton } from '@academyops/ui/registry';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight2 } from 'iconsax-react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getManagementPage, managementKey } from '@/api/management/queries';

import { Button, ButtonLink } from '@/components/base/buttons/button';

import { isStepUpRequired } from '@/features/academy/step-up-dialog';
import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { hasStaffPermission as hasPermission } from '@/features/dashboard/navigation';
import { useViewMode } from '@/features/dashboard/view-preference';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { managementText } from '@/i18n/management-copy';
import { useDocumentLocale } from '@/i18n/use-document-locale';
import { canRunManagementAction } from './action-access';

import { actionPermissions, createActions, type ManagementTarget, rowActions } from './actions';

import { type ManagementRow, type ManagementSection, resourceColumns, resourceFor } from './config';

import { exportRefreshInterval } from './export-refresh';

import { ManagementAvatar, ManagementValue } from './presentation';

export function useManagementPageState({
  section,
  user,
}: {
  section: ManagementSection;
  user: DashboardUser;
}) {
  const locale = useDocumentLocale();
  const copy = getAcademyCopy(locale);
  const t = (key: string) => managementText(locale, key);
  const pathname = usePathname();
  const params = useSearchParams();
  const sessionId = params.get('sessionId') || undefined;
  const defaultTab =
    section === 'documents' && !hasPermission(user, 'invoices.read')
      ? 'receipts'
      : params.get('tab');
  const resource = resourceFor(section, defaultTab, sessionId);
  const [search, setSearch] = useState(params.get('search') ?? '');
  const history = params.get('trail')?.split('~') ?? [];
  const [selection, setSelection] = useState<ManagementRow>();
  const [target, setTarget] = useState<ManagementTarget>();
  const [stepUp, setStepUp] = useState(false);
  const [range, setRange] = useState({
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
  });
  const pageNumber = Number(params.get('page'));
  const page = Number.isSafeInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1;
  const permitted =
    resource === 'receipts'
      ? hasPermission(user, 'receipts.read')
      : resource === 'invoices'
        ? hasPermission(user, 'invoices.read')
        : true;
  const filters = {
    ...(params.get('cursor') ? { cursor: params.get('cursor') ?? '' } : {}),
    ...(params.get('status') ? { status: params.get('status') ?? '' } : {}),
    ...(params.get('search') ? { search: params.get('search') ?? '' } : {}),
    ...(params.get('from') ? { from: params.get('from') ?? '' } : {}),
    ...(params.get('to') ? { to: params.get('to') ?? '' } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(params.get('cohortId') ? { cohortId: params.get('cohortId') ?? '' } : {}),
    ...(params.get('roomId') ? { roomId: params.get('roomId') ?? '' } : {}),
    ...(params.get('trainerId') ? { trainerId: params.get('trainerId') ?? '' } : {}),
    page,
  };
  const list = useQuery({
    queryKey: [...managementKey(user.id), 'list', resource, filters],
    queryFn: ({ signal }) => getManagementPage(resource, filters, signal),
    enabled: permitted,
    refetchInterval: (query) =>
      exportRefreshInterval(resource, query.state.data?.items, query.state.error),
    refetchIntervalInBackground: false,
  });
  useEffect(() => {
    if (isStepUpRequired(list.error)) setStepUp(true);
    else if (list.isSuccess) setStepUp(false);
  }, [list.error, list.isSuccess]);
  const querySearch = params.get('search') ?? '';
  useEffect(() => setSearch(querySearch), [querySearch]);
  const queryFrom = params.get('from') ?? '';
  const queryTo = params.get('to') ?? '';
  useEffect(() => setRange({ from: queryFrom, to: queryTo }), [queryFrom, queryTo]);
  const [view, setView] = useViewMode(params.get('view'));
  function updateParams(changes: Record<string, string | undefined>, reset = false) {
    if (changes.view === 'table' || changes.view === 'grid') {
      setView(changes.view);
    }
    const next = new URLSearchParams(params.toString());
    if (reset) {
      next.delete('cursor');
      next.delete('page');
      next.delete('trail');
      setSelection(undefined);
    }
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    window.history.pushState(null, '', `${pathname}${next.size ? `?${next}` : ''}`);
  }
  const create = section === 'attendance' ? undefined : createActions[resource];
  const canCreate = create && hasPermission(user, actionPermissions[create]);
  const launch = (action: NonNullable<typeof create>, row?: ManagementRow) =>
    setTarget({ action, resource, ...(row ? { row } : {}), ...(sessionId ? { sessionId } : {}) });
  const inspect = (row: ManagementRow) => {
    if (section === 'attendance' && resource === 'sessions')
      updateParams({ sessionId: row.id, status: undefined }, true);
    else setSelection(row);
  };
  const recordId = params.get('record');
  useEffect(() => {
    if (recordId && (section === 'sessions' || section === 'payments'))
      setSelection((old) =>
        old?.id === recordId
          ? old
          : { id: recordId, name: '', code: '', status: '', version: 0, data: {} },
      );
    else if (!recordId) setSelection(undefined);
  }, [recordId, section]);
  const columns: DataColumn<ManagementRow>[] = [
    {
      id: 'name',
      header: t(resource === 'roster' || resource === 'certificates' ? 'student.name' : 'name'),
      cell: (row) => (
        <button
          className="flex items-center gap-3 rounded-md text-start hover:text-brand"
          type="button"
          onClick={() => inspect(row)}
        >
          <ManagementAvatar row={row} resource={resource} />
          <span className="min-w-0">
            <span className="block font-medium text-ink">
              {resource === 'exports' ? t(row.name) : row.name}
            </span>
            {row.code ? <bdi className="mt-1 block text-xs text-ink-muted">{row.code}</bdi> : null}
          </span>
        </button>
      ),
    },
    ...resourceColumns[resource].map((name) => ({
      id: name,
      header: t(name),
      cell: (row: ManagementRow) => <ManagementValue data={row.data} name={name} locale={locale} />,
    })),
    {
      id: 'actions',
      header: copy.actions,
      cell: (row) =>
        resource === 'roster' ? (
          <div className="flex gap-2">
            {rowActions(resource, row)
              .filter((action) => canRunManagementAction(user, action, row))
              .map((action) => (
                <Button
                  key={action}
                  variant="secondary"
                  size="small"
                  onClick={() => launch(action, row)}
                >
                  {t(action)}
                </Button>
              ))}
          </div>
        ) : resource === 'sessions' && hasPermission(user, 'attendance.read') ? (
          <div className="flex items-center gap-2">
            <ButtonLink
              href={`/${locale}/attendance?sessionId=${encodeURIComponent(row.id)}`}
              variant="secondary"
              size="small"
            >
              {t('openRoster')}
            </ButtonLink>
            <IconButton
              size="icon-sm"
              variant="ghost"
              aria-label={`${copy.details}: ${row.name}`}
              onClick={() => inspect(row)}
            >
              <ArrowRight2 aria-hidden color="currentColor" className="size-4 rtl:rotate-180" />
            </IconButton>
          </div>
        ) : (
          <IconButton
            size="icon-sm"
            variant="ghost"
            aria-label={`${copy.details}: ${row.name}`}
            onClick={() => inspect(row)}
          >
            <ArrowRight2 aria-hidden color="currentColor" className="size-4 rtl:rotate-180" />
          </IconButton>
        ),
    },
  ];
  const tabs =
    section === 'documents'
      ? ['invoices', 'receipts'].filter((tab) =>
          hasPermission(user, tab === 'invoices' ? 'invoices.read' : 'receipts.read'),
        )
      : [resource];
  const group = ['sessions', 'attendance', 'certificates'].includes(section)
    ? 'operations'
    : 'financeGroup';
  const reset = () => {
    setSearch('');
    setRange({ from: '', to: '' });
    updateParams(
      {
        search: undefined,
        status: undefined,
        cursor: undefined,
        page: undefined,
        from: undefined,
        to: undefined,
        cohortId: undefined,
        roomId: undefined,
        trainerId: undefined,
      },
      true,
    );
  };
  const hasFilters = Boolean(
    filters.search ||
      filters.status ||
      filters.from ||
      filters.to ||
      filters.cohortId ||
      filters.roomId ||
      filters.trainerId,
  );
  return {
    section,
    user,
    locale,
    copy,
    t,
    params,
    sessionId,
    resource,
    search,
    setSearch,
    history,
    selection,
    setSelection,
    target,
    setTarget,
    stepUp,
    setStepUp,
    range,
    setRange,
    page,
    permitted,
    filters,
    list,
    view,
    updateParams,
    create,
    canCreate,
    launch,
    inspect,
    recordId,
    columns,
    tabs,
    group,
    reset,
    hasFilters,
  };
}
