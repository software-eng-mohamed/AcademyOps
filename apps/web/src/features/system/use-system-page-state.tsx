'use client';
import type { DataColumn } from '@academyops/ui';

import { useQuery } from '@tanstack/react-query';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { AccessAction } from '@/api/system/commands';
import { getSystemPage, systemField, systemKey, systemName } from '@/api/system/queries';

import { Button } from '@/components/base/buttons/button';

import { DirectoryAvatar } from '@/features/academy/academy-surfaces';

import { isStepUpRequired } from '@/features/academy/step-up-dialog';
import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { hasPermission } from '@/features/dashboard/navigation';
import { useViewMode } from '@/features/dashboard/view-preference';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { systemText } from '@/i18n/system-copy';
import { useDocumentLocale } from '@/i18n/use-document-locale';

import { type SystemRecord, type SystemSection, systemColumns, systemResources } from './config';

import { SystemIcon, SystemValue } from './system-ui';

export function useSystemPageState({
  section,
  user,
}: {
  section: Exclude<SystemSection, 'whatsapp'>;
  user: DashboardUser;
}) {
  const locale = useDocumentLocale();
  const copy = getAcademyCopy(locale);
  const t = (key: string) => systemText(locale, key);
  const params = useSearchParams();
  const pathname = usePathname();
  const resources = systemResources(section, user);
  const resource = resources.find((value) => value === params.get('tab')) ?? resources[0];
  const filters = Object.fromEntries(
    ['search', 'status', 'from', 'to', 'category', 'entityType', 'cursor'].flatMap((key) =>
      params.get(key) ? [[key, params.get(key) as string]] : [],
    ),
  );
  const [search, setSearch] = useState(filters.search ?? '');
  const [range, setRange] = useState({ from: filters.from ?? '', to: filters.to ?? '' });
  const [action, setAction] = useState<AccessAction>();
  const [upload, setUpload] = useState(false);
  const [stepUp, setStepUp] = useState(false);
  const [view, setView] = useViewMode(params.get('view'));
  const trail = params.get('trail')?.split('~') ?? [];
  const page = trail.length + 1;
  const list = useQuery({
    queryKey: [...systemKey(user.id), 'list', resource, filters],
    queryFn: ({ signal }) => {
      if (!resource) throw new Error('Access denied');
      return getSystemPage(resource, filters, signal);
    },
    enabled: Boolean(resource),
  });
  useEffect(() => {
    if (isStepUpRequired(list.error)) setStepUp(true);
    else if (list.isSuccess) setStepUp(false);
  }, [list.error, list.isSuccess]);
  useEffect(() => setSearch(filters.search ?? ''), [filters.search]);
  useEffect(
    () => setRange({ from: filters.from ?? '', to: filters.to ?? '' }),
    [filters.from, filters.to],
  );
  function update(changes: Record<string, string | undefined>, reset = false) {
    if (changes.view === 'table' || changes.view === 'grid') {
      setView(changes.view);
    }
    const next = new URLSearchParams(params.toString());
    if (reset) for (const key of ['cursor', 'trail', 'detail']) next.delete(key);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    window.history.pushState(null, '', `${pathname}${next.size ? `?${next}` : ''}`);
  }
  if (!resource) return { denied: true as const, copy };
  const inspect = (item: SystemRecord) => update({ detail: item.id });
  const create: AccessAction | undefined =
    resource === 'users'
      ? 'createUser'
      : resource === 'roles'
        ? 'createRole'
        : resource === 'branches'
          ? 'createBranch'
          : undefined;
  const canUpload = resource === 'imports' && hasPermission(user, 'imports.execute', ['O']);
  const columns: DataColumn<SystemRecord>[] = [
    {
      id: 'name',
      header: t('name'),
      cell: (item) => (
        <button
          type="button"
          onClick={() => inspect(item)}
          className="flex items-center gap-3 rounded-md text-start text-sm font-semibold text-ink hover:text-brand"
        >
          <DirectoryAvatar
            {...(resource === 'users'
              ? { name: systemName(resource, item) }
              : { icon: <SystemIcon section={section} /> })}
          />
          <span className="max-w-64 whitespace-normal [overflow-wrap:anywhere]">
            {systemName(resource, item)}
          </span>
        </button>
      ),
    },
    ...systemColumns[resource].map((name) => ({
      id: name,
      header: t(name),
      cell: (item: SystemRecord) => (
        <SystemValue name={name} value={systemField(item, name)} locale={locale} />
      ),
    })),
    {
      id: 'actions',
      header: copy.actions,
      cell: (item) => (
        <Button
          variant="ghost"
          size="small"
          aria-label={`${copy.details}: ${systemName(resource, item)}`}
          onClick={() => inspect(item)}
        >
          {copy.view}
        </Button>
      ),
    },
  ];
  const filtered = Object.keys(filters).some((key) => key !== 'cursor');
  const reset = () =>
    update(
      {
        search: undefined,
        status: undefined,
        from: undefined,
        to: undefined,
        entityType: undefined,
        category: undefined,
      },
      true,
    );
  return {
    denied: false as const,
    section,
    user,
    locale,
    copy,
    t,
    params,
    resources,
    resource,
    filters,
    search,
    setSearch,
    range,
    setRange,
    action,
    setAction,
    upload,
    setUpload,
    stepUp,
    setStepUp,
    view,
    trail,
    page,
    list,
    update,
    inspect,
    create,
    canUpload,
    columns,
    filtered,
    reset,
  };
}
