'use client';

import { AcademyTabPanel as TabPanel } from '@academyops/ui/academy';
import { managementRow } from '@/api/management/queries';
import { Button } from '@/components/base/buttons/button';
import { AcademyEmpty, AcademyLoading } from '@/features/academy/academy-records';
import styles from '@/features/academy/academy-styles';
import {
  DirectoryCard,
  DirectoryTab as Tab,
  DirectoryTabList as TabList,
  DirectoryTabs as Tabs,
} from '@/features/academy/academy-surfaces';
import { AcademyTable } from '@/features/academy/academy-table';
import { ErrorNotice, formatAcademyDateTime } from '@/features/academy/academy-ui';
import { AcademyPagination, AcademyResultCount } from '@/features/academy/academy-workspace';
import { hasStaffPermission as hasPermission } from '@/features/dashboard/navigation';
import { AttendanceTools } from './attendance-tools';
import { resourceColumns } from './config';
import { ManagementToolbar } from './management-toolbar';
import {
  ManagementAvatar,
  ManagementIcon,
  ManagementStatus,
  ManagementValue,
  ReceivablesSummary,
} from './presentation';
import type { useManagementPageState } from './use-management-page-state';

export function ManagementPageRecords({
  model,
}: {
  model: ReturnType<typeof useManagementPageState>;
}) {
  const {
    section,
    user,
    locale,
    copy,
    t,
    sessionId,
    resource,
    history,
    setTarget,
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
    columns,
    tabs,
    reset,
    hasFilters,
  } = model;

  return (
    <Tabs
      value={resource}
      onValueChange={(tab) => {
        if (section === 'documents') updateParams({ tab, status: undefined }, true);
      }}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
    >
      <div className={styles.canvasHeader}>
        <TabList aria-label={t(section)}>
          {tabs.map((tab) => (
            <Tab key={tab} value={tab}>
              <ManagementIcon section={tab as typeof resource} className="size-4" />
              {t(tab)}
            </Tab>
          ))}
        </TabList>
        <AcademyResultCount
          count={list.isError ? undefined : list.data?.items.length}
          label={copy.visibleRecords}
        />
      </div>
      <ManagementToolbar model={model} />
      <TabPanel key={resource} value={resource} className="mt-0">
        {!permitted ? (
          <p role="alert" className="p-6 text-ink-muted">
            {copy.forbidden}
          </p>
        ) : list.isPending ? (
          <AcademyLoading label={copy.loading} />
        ) : list.isError ? (
          <ErrorNotice error={list.error} copy={copy} retry={() => void list.refetch()} />
        ) : (
          <>
            {list.data.summary ? (
              <ReceivablesSummary summary={list.data.summary} locale={locale} />
            ) : null}
            {resource === 'roster' && list.data.session ? (
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4">
                <div className="flex items-center gap-3">
                  <ManagementStatus
                    value={String(list.data.session.attendanceWindowState)}
                    locale={locale}
                  />
                  <ManagementValue data={list.data.session} name="startsAt" locale={locale} />
                </div>
                {hasPermission(user, 'attendance.qr.open') &&
                list.data.session.status === 'SCHEDULED' &&
                ['SCHEDULED', 'OPEN'].includes(String(list.data.session.attendanceWindowState)) ? (
                  <Button
                    onClick={() =>
                      setTarget({
                        action:
                          list.data.session?.attendanceWindowState === 'OPEN'
                            ? 'closeWindow'
                            : 'openWindow',
                        resource: 'sessions',
                        row: {
                          ...managementRow('sessions', list.data.session),
                          name: `${t('sessions')} · ${formatAcademyDateTime(list.data.session?.startsAt, locale, copy.none)}`,
                        },
                      })
                    }
                  >
                    {t(
                      list.data.session.attendanceWindowState === 'OPEN'
                        ? 'closeWindow'
                        : 'openWindow',
                    )}
                  </Button>
                ) : null}
              </div>
            ) : null}
            {!list.data.items.length ? (
              <>
                {resource === 'roster' && list.data.session ? (
                  <AttendanceTools
                    key={sessionId}
                    session={list.data.session}
                    user={user}
                    locale={locale}
                  />
                ) : null}
                <AcademyEmpty
                  copy={copy}
                  {...(hasFilters ? { onReset: reset } : {})}
                  {...(canCreate && create ? { onCreate: () => launch(create) } : {})}
                />
              </>
            ) : view === 'grid' && resource !== 'roster' ? (
              <div className={styles.recordGrid} aria-busy={list.isFetching}>
                {list.data.items.map((row) => (
                  <DirectoryCard
                    key={row.id}
                    name={resource === 'exports' ? t(row.name) : row.name}
                    code={row.code}
                    resource={resource}
                    avatar={<ManagementAvatar row={row} resource={resource} large />}
                    status={
                      row.status ? (
                        <ManagementStatus value={row.status} locale={locale} />
                      ) : undefined
                    }
                    onInspect={() => inspect(row)}
                    viewLabel={section === 'attendance' ? t('openRoster') : copy.view}
                  >
                    <dl className={styles.cardFacts}>
                      {resourceColumns[resource]
                        .filter((name) => name !== 'status')
                        .map((name) => (
                          <div key={name}>
                            <dt>{t(name)}</dt>
                            <dd>
                              <ManagementValue data={row.data} name={name} locale={locale} />
                            </dd>
                          </div>
                        ))}
                    </dl>
                  </DirectoryCard>
                ))}
              </div>
            ) : (
              <>
                {resource === 'roster' && list.data.session ? (
                  <AttendanceTools
                    key={sessionId}
                    session={list.data.session}
                    user={user}
                    locale={locale}
                  />
                ) : null}
                <AcademyTable
                  rows={list.data.items}
                  columns={columns}
                  label={t(resource)}
                  busy={list.isFetching}
                />
              </>
            )}
          </>
        )}
        <AcademyPagination
          pageLabel={`${copy.page} ${page}`}
          page={page}
          {...(list.data?.pages ? { totalPages: list.data.pages } : {})}
          hasNext={
            Boolean(list.data?.nextCursor) || Boolean(list.data?.pages && page < list.data.pages)
          }
          hasPrevious={page > 1 && (resource === 'aging' || history.length > 0)}
          disabled={list.isFetching}
          labels={{
            label: copy.pagination,
            previous: copy.previous,
            next: copy.next,
            page: copy.goToPage,
          }}
          onChange={(next) => {
            if (resource === 'aging') updateParams({ page: String(next) });
            else if (next > page && list.data?.nextCursor) {
              updateParams({
                cursor: list.data.nextCursor,
                page: String(next),
                trail: [...history, filters.cursor ?? '_'].join('~'),
              });
            } else if (next < page && history.length) {
              const previous = history.at(-1);
              updateParams({
                cursor: previous === '_' ? undefined : previous,
                page: String(next),
                trail: history.slice(0, -1).join('~') || undefined,
              });
            }
          }}
        />
      </TabPanel>
    </Tabs>
  );
}
