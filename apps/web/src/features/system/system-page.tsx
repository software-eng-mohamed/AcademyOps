'use client';

import { AcademyTabPanel } from '@academyops/ui/academy';
import { Element3 } from 'iconsax-react';
import { systemField, systemName } from '@/api/system/queries';
import { Breadcrumb, BreadcrumbItem } from '@/components/base/breadcrumb/breadcrumb';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { AcademyEmpty, AcademyLoading } from '@/features/academy/academy-records';
import styles from '@/features/academy/academy-styles';
import {
  DirectoryAvatar,
  DirectoryCard,
  DirectoryHeading,
  DirectoryTab,
  DirectoryTabList,
  DirectoryTabs,
} from '@/features/academy/academy-surfaces';
import { AcademyTable } from '@/features/academy/academy-table';
import { ErrorNotice } from '@/features/academy/academy-ui';
import {
  AcademyPagination,
  AcademyResultCount,
  AcademyToolbar,
} from '@/features/academy/academy-workspace';

import { systemColumns, systemStatuses } from './config';
import { SystemPageDialogs } from './system-page-dialogs';
import { SystemIcon, SystemSelect, SystemStatus, SystemValue } from './system-ui';
import { useSystemPageState } from './use-system-page-state';
export function SystemPage(props: Parameters<typeof useSystemPageState>[0]) {
  const model = useSystemPageState(props);
  if (model.denied) {
    const { copy } = model;
    return (
      <p role="alert" className="p-8">
        {copy.forbidden}
      </p>
    );
  }
  const {
    section,
    locale,
    copy,
    t,
    resources,
    resource,
    filters,
    search,
    setSearch,
    range,
    setRange,
    setAction,
    setUpload,
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
  } = model;
  return (
    <div className={styles.page} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <div className={styles.container}>
        <Breadcrumb aria-label={t('system')} className="mb-6 min-h-10 [&>ol]:px-0">
          <BreadcrumbItem
            className="mx-0 px-0 py-1 text-sm font-semibold text-text-secondary hover:text-text-primary"
            href={`/${locale}/dashboard`}
          >
            <Element3 aria-hidden size={16} color="currentColor" variant="Bulk" />
            {copy.dashboard}
          </BreadcrumbItem>
          <BreadcrumbItem className="mx-0 px-0 py-1 text-sm font-semibold text-text-secondary">
            {t('system')}
          </BreadcrumbItem>
          <BreadcrumbItem
            className="rounded-lg bg-linear-to-r from-accent-600 to-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm"
            current
          >
            {t(section)}
          </BreadcrumbItem>
        </Breadcrumb>
        <DirectoryHeading
          title={t(section)}
          description={t(`${section}Description`)}
          icon={<SystemIcon section={section} className="size-7" />}
          {...(create
            ? { action: { label: t(create), onClick: () => setAction(create) } }
            : canUpload
              ? { action: { label: t('stage'), onClick: () => setUpload(true) } }
              : {})}
        />
        <div className={styles.canvas}>
          <DirectoryTabs
            value={resource}
            onValueChange={(tab) => update({ tab, search: undefined, status: undefined }, true)}
            dir={locale === 'ar' ? 'rtl' : 'ltr'}
          >
            <div className={styles.canvasHeader}>
              <DirectoryTabList aria-label={t(section)}>
                {resources.map((entry) => (
                  <DirectoryTab key={entry} value={entry}>
                    <SystemIcon section={section} className="size-4" />
                    {t(entry)}
                  </DirectoryTab>
                ))}
              </DirectoryTabList>
              <AcademyResultCount
                count={list.isError ? undefined : list.data?.items.length}
                label={copy.visibleRecords}
              />
            </div>
            <AcademyToolbar
              copy={copy}
              view={view}
              onViewChange={(value) => update({ view: value })}
              {...(resource !== 'imports'
                ? {
                    search: {
                      value: search,
                      onChange: setSearch,
                      onSubmit: () =>
                        update(
                          {
                            search:
                              search.trim().slice(0, resource === 'audit' ? 100 : 200) || undefined,
                          },
                          true,
                        ),
                    },
                  }
                : {})}
              filters={
                <>
                  {systemStatuses[resource] ? (
                    <div className="w-44">
                      <SystemSelect
                        label={copy.selectStatus}
                        value={filters.status || 'allStatuses'}
                        options={['allStatuses', ...(systemStatuses[resource] ?? [])]}
                        locale={locale}
                        onChange={(value) =>
                          update({ status: value === 'allStatuses' ? undefined : value }, true)
                        }
                      />
                    </div>
                  ) : null}
                  {resource === 'audit' ? (
                    <form
                      className="flex flex-wrap items-end gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!range.from || !range.to || range.from <= range.to) update(range, true);
                      }}
                    >
                      <Input
                        type="date"
                        label={`${t('from')} · ${t('cairoTime')}`}
                        value={range.from}
                        onChange={(from) => setRange((old) => ({ ...old, from }))}
                        className="w-40"
                      />
                      <Input
                        type="date"
                        label={`${t('to')} · ${t('cairoTime')}`}
                        value={range.to}
                        onChange={(to) => setRange((old) => ({ ...old, to }))}
                        className="w-40"
                      />
                      <Button
                        variant="secondary"
                        type="submit"
                        disabled={Boolean(range.from && range.to && range.from > range.to)}
                      >
                        {t('apply')}
                      </Button>
                    </form>
                  ) : null}
                  {filtered ? (
                    <Button variant="ghost" onClick={reset}>
                      {copy.reset}
                    </Button>
                  ) : null}
                </>
              }
            />
            <AcademyTabPanel value={resource} className="mt-0">
              {list.isPending ? (
                <AcademyLoading label={copy.loading} />
              ) : list.isError ? (
                <ErrorNotice error={list.error} copy={copy} retry={() => void list.refetch()} />
              ) : !list.data.items.length ? (
                <AcademyEmpty
                  copy={copy}
                  {...(filtered ? { onReset: reset } : {})}
                  {...(create ? { onCreate: () => setAction(create) } : {})}
                />
              ) : view === 'table' ? (
                <AcademyTable
                  rows={list.data.items}
                  columns={columns}
                  label={t(resource)}
                  busy={list.isFetching}
                />
              ) : (
                <div className={styles.recordGrid}>
                  {list.data.items.map((item) => (
                    <DirectoryCard
                      key={item.id}
                      name={systemName(resource, item)}
                      resource={resource}
                      avatar={
                        <DirectoryAvatar
                          {...(resource === 'users'
                            ? { name: systemName(resource, item) }
                            : { icon: <SystemIcon section={section} /> })}
                          large
                        />
                      }
                      status={
                        item.status ? <SystemStatus value={item.status} locale={locale} /> : null
                      }
                      onInspect={() => inspect(item)}
                      viewLabel={copy.view}
                    >
                      <dl className={styles.cardFacts}>
                        {systemColumns[resource]
                          .filter((name) => name !== 'status')
                          .map((name) => (
                            <div key={name}>
                              <dt>{t(name)}</dt>
                              <dd>
                                <SystemValue
                                  value={systemField(item, name)}
                                  name={name}
                                  locale={locale}
                                />
                              </dd>
                            </div>
                          ))}
                      </dl>
                    </DirectoryCard>
                  ))}
                </div>
              )}
              <AcademyPagination
                page={page}
                pageLabel={`${copy.page} ${page.toLocaleString(locale)}`}
                hasNext={Boolean(list.data?.nextCursor)}
                hasPrevious={trail.length > 0}
                disabled={list.isFetching}
                labels={{
                  label: copy.pagination,
                  previous: copy.previous,
                  next: copy.next,
                  page: copy.goToPage,
                }}
                onChange={(next) => {
                  if (next > page && list.data?.nextCursor)
                    update({
                      cursor: list.data.nextCursor,
                      trail: [...trail, filters.cursor ?? '_'].join('~'),
                    });
                  else if (next < page && trail.length)
                    update({
                      cursor: trail.at(-1) === '_' ? undefined : trail.at(-1),
                      trail: trail.slice(0, -1).join('~') || undefined,
                    });
                }}
              />
            </AcademyTabPanel>
          </DirectoryTabs>
        </div>
        <SystemPageDialogs model={model} />
      </div>
    </div>
  );
}
