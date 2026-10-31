'use client';
import { Field } from '@academyops/ui';
import { AcademyTabPanel } from '@academyops/ui/academy';
import { Element3 } from 'iconsax-react';
import type { AcademyRecord } from '@/api/academy/models';
import { Breadcrumb, BreadcrumbItem } from '@/components/base/breadcrumb/breadcrumb';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { Select, SelectItem } from '@/components/base/select/select';
import { AcademyEmpty, AcademyLoading, AcademyRecords } from '@/features/academy/academy-records';
import styles from '@/features/academy/academy-styles';
import {
  DirectoryHeading,
  DirectoryTab,
  DirectoryTabList,
  DirectoryTabs,
} from '@/features/academy/academy-surfaces';
import { ErrorNotice } from '@/features/academy/academy-ui';
import {
  AcademyPagination,
  AcademyResultCount,
  AcademyToolbar,
} from '@/features/academy/academy-workspace';

import { hasPermission } from '@/features/dashboard/navigation';

import { ManagementDetail } from '@/features/management/detail-drawer';
import { ManagementAvatar, ManagementStatus } from '@/features/management/presentation';

import { managementText } from '@/i18n/management-copy';

import { StudentAttendanceTools } from './student-attendance-tools';
import { StudentDetail } from './student-detail';
import { useStudentPageState } from './use-student-page-state';
export function StudentPage(props: Parameters<typeof useStudentPageState>[0]) {
  const {
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
  } = useStudentPageState(props);
  return (
    <div className={styles.page} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <div className={styles.container}>
        <Breadcrumb className="mb-6 min-h-10 [&>ol]:px-0">
          <BreadcrumbItem
            className="mx-0 px-0 py-1 text-sm font-semibold text-text-secondary hover:text-text-primary"
            href={`/${locale}/dashboard`}
          >
            <Element3 aria-hidden size={16} color="currentColor" variant="Bulk" />
            {copy.dashboard}
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
          description={t(`${section}Hint`)}
          icon={<Icon aria-hidden size={28} color="currentColor" variant="Bulk" />}
        >
          {section === 'attendance' && hasPermission(user, 'attendance.check_in_self', ['S']) ? (
            <StudentAttendanceTools userId={user.id} locale={locale} />
          ) : null}
        </DirectoryHeading>
        <section className={styles.canvas}>
          <DirectoryTabs
            dir={locale === 'ar' ? 'rtl' : 'ltr'}
            value={resource}
            onValueChange={(key) => update({ tab: key, status: undefined }, true)}
          >
            <div className={styles.canvasHeader}>
              <DirectoryTabList aria-label={t(section)}>
                {tabItems.map((item) => (
                  <DirectoryTab key={item.id} value={item.id}>
                    {item.label}
                  </DirectoryTab>
                ))}
              </DirectoryTabList>
              <AcademyResultCount count={list.data?.items.length} label={t(section)} />
            </div>
            <AcademyTabPanel value={resource}>
              <AcademyToolbar
                copy={copy}
                view={view}
                onViewChange={(value) => update({ view: value })}
                filters={
                  <>
                    {states?.length ? (
                      <Field htmlFor="student-status" label={copy.selectStatus}>
                        <Select
                          triggerId="student-status"
                          aria-label={copy.selectStatus}
                          selectedKey={status ?? 'all'}
                          placeholder={copy.allStatuses}
                          renderValue={status ? managementText(locale, status) : copy.allStatuses}
                          onSelectionChange={(key) =>
                            update({ status: key === 'all' ? undefined : String(key) }, true)
                          }
                          className="min-w-44"
                        >
                          <SelectItem id="all" textValue={copy.allStatuses}>
                            {copy.allStatuses}
                          </SelectItem>
                          {states
                            .filter(
                              (state) =>
                                state !== 'DRAFT' ||
                                resource === 'enrollments' ||
                                resource === 'invoices',
                            )
                            .map((state) => (
                              <SelectItem
                                key={state}
                                id={state}
                                textValue={managementText(locale, state)}
                              >
                                {managementText(locale, state)}
                              </SelectItem>
                            ))}
                        </Select>
                      </Field>
                    ) : null}
                    {resource === 'sessions'
                      ? (['from', 'to'] as const).map((key) => (
                          <Field
                            key={key}
                            htmlFor={`student-${key}`}
                            label={managementText(locale, key)}
                          >
                            <Input
                              id={`student-${key}`}
                              aria-label={managementText(locale, key)}
                              type="date"
                              value={(key === 'from' ? from : to) ?? ''}
                              onChange={(value) => update({ [key]: value }, true)}
                            />
                          </Field>
                        ))
                      : null}
                    {hasFilters ? (
                      <Button variant="secondary" onClick={resetFilters}>
                        {copy.reset}
                      </Button>
                    ) : null}
                  </>
                }
              />
              <div className="pb-5">
                {!permitted ? (
                  <p role="alert">{t('unavailable')}</p>
                ) : invalidDates ? (
                  <p role="alert">{managementText(locale, 'invalidDate')}</p>
                ) : list.isPending ? (
                  <AcademyLoading label={copy.loading} />
                ) : list.isError ? (
                  <ErrorNotice error={list.error} copy={copy} retry={() => void list.refetch()} />
                ) : list.data.items.length ? (
                  <AcademyRecords
                    renderStatus={(row) => <ManagementStatus value={row.status} locale={locale} />}
                    {...(resource !== 'enrollments'
                      ? {
                          renderAvatar: (row: AcademyRecord) => (
                            <ManagementAvatar row={row} resource={resource} large />
                          ),
                        }
                      : {})}
                    rows={list.data.items}
                    columns={columns}
                    resource={
                      resource === 'enrollments'
                        ? 'programs'
                        : resource === 'sessions'
                          ? 'cohorts'
                          : 'modules'
                    }
                    copy={copy}
                    locale={locale}
                    view={view}
                    busy={list.isFetching}
                    onInspect={inspect}
                  />
                ) : (
                  <AcademyEmpty copy={copy} {...(hasFilters ? { onReset: resetFilters } : {})} />
                )}
              </div>
              <AcademyPagination
                pageLabel={`${page}`}
                page={page}
                hasPrevious={page > 1 && trail.length > 0}
                hasNext={Boolean(list.data?.nextCursor)}
                disabled={list.isFetching}
                labels={{
                  label: copy.pagination,
                  previous: copy.previous,
                  next: copy.next,
                  page: copy.goToPage,
                }}
                onChange={(nextPage) =>
                  update(
                    nextPage < page
                      ? {
                          cursor: trail.at(-1) || undefined,
                          trail: trail.slice(0, -1).join('~') || undefined,
                          page: String(page - 1),
                          record: undefined,
                        }
                      : {
                          cursor: list.data?.nextCursor || undefined,
                          trail: [...trail, cursor ?? ''].join('~'),
                          page: String(page + 1),
                          record: undefined,
                        },
                  )
                }
              />
            </AcademyTabPanel>
          </DirectoryTabs>
        </section>
        {selected && permitted ? (
          resource === 'enrollments' || resource === 'sessions' ? (
            <StudentDetail
              key={`${resource}:${selected.id}`}
              resource={resource}
              section={section}
              row={selected}
              user={user}
              locale={locale}
              onClose={close}
            />
          ) : (
            <ManagementDetail
              key={`${resource}:${selected.id}`}
              resource={resource}
              row={selected}
              user={user}
              locale={locale}
              onClose={close}
              onAction={() => {}}
            />
          )
        ) : null}
      </div>
    </div>
  );
}
