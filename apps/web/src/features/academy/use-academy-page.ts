'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  type AcademyRecord,
  type AcademyResource,
  type AcademySection,
  record,
  resourceStatuses,
  textValue,
} from '@/api/academy/models';
import { academyKey, getAcademyContext, getAcademyPage, getAssignees } from '@/api/academy/queries';
import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { hasStaffPermission as hasPermission } from '@/features/dashboard/navigation';
import { useViewMode } from '@/features/dashboard/view-preference';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { useDocumentLocale } from '@/i18n/use-document-locale';
import { type ActionTarget, actionPermission } from './actions';
import type { DetailSelection } from './detail-drawer';
import { isStepUpRequired } from './step-up-dialog';

export function useAcademyPage({
  section,
  user,
}: {
  section: AcademySection;
  user: DashboardUser;
}) {
  const locale = useDocumentLocale();
  const copy = getAcademyCopy(locale);
  const pathname = usePathname();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const tab = params.get('tab');
  const resource: AcademyResource =
    section === 'resources'
      ? tab === 'trainers' || tab === 'modules'
        ? tab
        : 'rooms'
      : section === 'leads' && tab === 'stages'
        ? 'stages'
        : section;
  const querySearch = params.get('search') ?? '';
  const [search, setSearch] = useState(querySearch);
  const history = params.get('trail')?.split('~') ?? [];
  const [selection, setSelection] = useState<DetailSelection[]>([]);
  const [target, setTarget] = useState<ActionTarget>();
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const parsedPage = Number(params.get('page'));
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const cursor = params.get('cursor') || undefined;
  const filters = {
    ...(params.get('search') ? { search: params.get('search') ?? '' } : {}),
    ...(params.get('status') ? { status: params.get('status') ?? '' } : {}),
    ...(cursor ? { cursor } : {}),
    ...(params.get('studentId') ? { studentId: params.get('studentId') ?? '' } : {}),
    page,
  };
  const context = useQuery({
    queryKey: [...academyKey(user.id), 'context'],
    queryFn: ({ signal }) => getAcademyContext(signal),
    staleTime: 60_000,
  });
  const branchId = context.data?.branches[0]?.id;
  const list = useQuery({
    queryKey: [...academyKey(user.id), 'list', resource, filters],
    queryFn: ({ signal }) => getAcademyPage(resource, filters, signal),
  });
  const assignees = useQuery({
    queryKey: [...academyKey(user.id), 'assignees', branchId],
    queryFn: ({ signal }) => getAssignees(branchId ?? '', '', signal),
    enabled: resource === 'leads' && Boolean(branchId) && hasPermission(user, 'leads.assign'),
  });
  const [view, setView] = useViewMode(params.get('view'));
  function updateParams(changes: Record<string, string | undefined>, resetPage = false) {
    if (changes.view === 'table' || changes.view === 'grid') {
      setView(changes.view);
    }
    const next = new URLSearchParams(params.toString());
    if (resetPage) {
      next.delete('cursor');
      next.delete('page');
      next.delete('trail');
    }
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    window.history.pushState(null, '', `${pathname}${next.size ? `?${next}` : ''}`);
  }
  const selectedId = params.get('record');
  useEffect(() => setSearch(querySearch), [querySearch]);
  useEffect(() => {
    if (selectedId && !['rooms', 'modules', 'stages'].includes(resource))
      setSelection((old) =>
        old[0]?.row.id === selectedId
          ? old
          : [
              {
                resource,
                row: { id: selectedId, name: '', code: '', status: '', version: 0, data: {} },
              },
            ],
      );
    else if (!selectedId) setSelection([]);
  }, [resource, selectedId]);
  const inspect = (row: AcademyRecord) => setSelection([{ resource, row }]);
  const statuses = resourceStatuses[resource];
  const canCreate =
    !['registrations', 'versions'].includes(resource) &&
    hasPermission(
      user,
      actionPermission(resource, 'create'),
      resource === 'stages' ? ['O'] : undefined,
    );
  const requiresBranch = ['leads', 'students', 'cohorts', 'rooms'].includes(resource);
  const tabs: AcademyResource[] =
    section === 'resources'
      ? ['rooms', 'trainers', 'modules']
      : section === 'leads'
        ? ['leads', 'stages']
        : [resource];
  async function saved(result: unknown) {
    const assignedAway =
      target?.action === 'assign' &&
      !hasPermission(user, 'leads.read', ['O', 'B']) &&
      textValue(record(result).assignedUserId) !== user.id;
    if (target?.action === 'merge' || assignedAway) {
      setSelection([]);
      if (selectedId) updateParams({ record: undefined });
    }
    await queryClient.invalidateQueries({ queryKey: academyKey(user.id) });
    await queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey.some((part) => typeof part === 'string' && /dashboard/.test(part)),
    });
  }
  const activeSelection = selection.at(-1);

  useEffect(() => {
    if (isStepUpRequired(list.error)) setStepUpOpen(true);
    else if (list.isSuccess) setStepUpOpen(false);
  }, [list.error, list.isSuccess]);

  return {
    section,
    user,
    locale,
    copy,
    pathname,
    params,
    queryClient,
    tab,
    resource,
    querySearch,
    search,
    setSearch,
    history,
    selection,
    setSelection,
    target,
    setTarget,
    stepUpOpen,
    setStepUpOpen,
    parsedPage,
    page,
    cursor,
    filters,
    context,
    branchId,
    list,
    assignees,
    view,
    updateParams,
    selectedId,
    inspect,
    statuses,
    canCreate,
    requiresBranch,
    tabs,
    saved,
    activeSelection,
  };
}
export type AcademyPageModel = ReturnType<typeof useAcademyPage>;
