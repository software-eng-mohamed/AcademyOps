'use client';
import { Field } from '@academyops/ui';

import { ArrowLeft2 } from 'iconsax-react';

import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { Select, SelectItem } from '@/components/base/select/select';

import { AcademyToolbar } from '@/features/academy/academy-workspace';

import { resourceStatuses } from './config';

import { ManagementLookup } from './lookup-select';
import type { useManagementPageState } from './use-management-page-state';
export function ManagementToolbar({ model }: { model: ReturnType<typeof useManagementPageState> }) {
  const {
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
    range,
    setRange,
    filters,
    view,
    updateParams,
    reset,
    hasFilters,
  } = model;
  return (
    <AcademyToolbar
      view={view}
      showViewSwitch={resource !== 'roster'}
      onViewChange={(value) => updateParams({ view: value })}
      copy={copy}
      {...(resource === 'businessAccounts'
        ? {
            search: {
              value: search,
              onChange: setSearch,
              onSubmit: () => updateParams({ search: search.trim() || undefined }, true),
            },
          }
        : {})}
      filters={
        <>
          {resourceStatuses[resource] ? (
            <Field htmlFor="management-status-filter" label={copy.selectStatus}>
              <Select
                aria-label={copy.selectStatus}
                triggerId="management-status-filter"
                className="w-40"
                triggerClassName="h-10"
                selectedKey={filters.status || '__all'}
                placeholder={copy.allStatuses}
                renderValue={filters.status ? t(filters.status) : copy.allStatuses}
                onSelectionChange={(value) =>
                  updateParams(
                    { status: value === '__all' ? undefined : String(value ?? '') },
                    true,
                  )
                }
              >
                <SelectItem id="__all" textValue={copy.allStatuses}>
                  {copy.allStatuses}
                </SelectItem>
                {resourceStatuses[resource]?.map((status) => (
                  <SelectItem key={status} id={status} textValue={t(status)}>
                    {t(status)}
                  </SelectItem>
                ))}
              </Select>
            </Field>
          ) : null}
          {resource === 'sessions' ? (
            <div className="flex flex-wrap items-end gap-3">
              {(
                [
                  ['cohortId', 'cohorts'],
                  ['roomId', 'rooms'],
                  ['trainerId', 'trainers'],
                ] as const
              ).map(([name, kind]) => (
                <div key={name} className="w-44">
                  <ManagementLookup
                    name={name}
                    kind={kind}
                    values={{ [name]: params.get(name) ?? '' }}
                    onChange={(value) => updateParams({ [name]: value }, true)}
                    userId={user.id}
                    locale={locale}
                    controlId={`filter-${name}`}
                  />
                </div>
              ))}
            </div>
          ) : null}
          {resource === 'sessions' ? (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!range.from || !range.to || range.from <= range.to)
                  updateParams({ from: range.from, to: range.to }, true);
              }}
            >
              <Input
                label={`${t('from')} · ${t('cairoTime')}`}
                type="date"
                value={range.from}
                onChange={(from) => setRange((previous) => ({ ...previous, from }))}
                className="w-40"
              />
              <Input
                label={`${t('to')} · ${t('cairoTime')}`}
                type="date"
                value={range.to}
                onChange={(to) => setRange((previous) => ({ ...previous, to }))}
                className="w-40"
              />
              <Button
                type="submit"
                variant="secondary"
                disabled={Boolean(range.from && range.to && range.from > range.to)}
              >
                {t('apply')}
              </Button>
            </form>
          ) : null}
          {section === 'attendance' && sessionId ? (
            <Button
              variant="secondary"
              onClick={() => updateParams({ sessionId: undefined }, true)}
            >
              <ArrowLeft2
                aria-hidden
                color="currentColor"
                size={16}
                className="me-2 rtl:rotate-180"
              />
              {t('backToSessions')}
            </Button>
          ) : null}
          {hasFilters ? (
            <Button variant="ghost" onClick={reset}>
              {copy.reset}
            </Button>
          ) : null}
        </>
      }
    />
  );
}
