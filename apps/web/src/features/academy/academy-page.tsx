'use client';
import { Element3 } from 'iconsax-react';
import type { AcademySection } from '@/api/academy/models';
import { Breadcrumb, BreadcrumbItem } from '@/components/base/breadcrumb/breadcrumb';
import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { academyLabel } from '@/i18n/academy-copy';
import { AcademyPageDialogs } from './academy-page-dialogs';
import { AcademyPageRecords } from './academy-page-records';
import { AcademyPageToolbar } from './academy-page-toolbar';
import styles from './academy-styles';
import {
  DirectoryTab as Tab,
  DirectoryTabList as TabList,
  DirectoryTabs as Tabs,
} from './academy-surfaces';
import { AcademyHeading, AcademyIcon, AcademyResultCount } from './academy-workspace';
import { DetailFullPage } from './detail-full-page';
import { useAcademyPage } from './use-academy-page';
export function AcademyPage(props: { section: AcademySection; user: DashboardUser }) {
  const model = useAcademyPage(props);
  const {
    section,
    locale,
    copy,
    resource,
    setSearch,
    setSelection,
    setTarget,
    context,
    branchId,
    list,
    updateParams,
    canCreate,
    requiresBranch,
    tabs,
    selection,
    activeSelection,
    params,
    user,
  } = model;
  const isFullPage = params.get('mode') === 'page' && Boolean(activeSelection);
  const sectionPath = ['programs', 'cohorts', 'resources'].includes(section)
    ? `academic/${section}`
    : section;
  return (
    <div className={styles.page} dir={locale === 'ar' ? 'rtl' : 'ltr'} data-academy-page={section}>
      <div className={styles.container}>
        <Breadcrumb aria-label={copy.academy} className="mb-6 min-h-10 [&>ol]:px-0">
          <BreadcrumbItem
            className="mx-0 px-0 py-1 text-sm font-semibold text-text-secondary hover:text-text-primary"
            href={`/${locale}/dashboard`}
          >
            <Element3 aria-hidden size={16} color="currentColor" variant="Bulk" />
            {copy.dashboard}
          </BreadcrumbItem>
          <BreadcrumbItem className="mx-0 px-0 py-1 text-sm font-semibold text-text-secondary">
            {copy.academy}
          </BreadcrumbItem>
          {isFullPage && activeSelection ? (
            <>
              <BreadcrumbItem
                className="mx-0 px-0 py-1 text-sm font-semibold text-text-secondary hover:text-text-primary"
                href={`/${locale}/${sectionPath}`}
                onClick={() => {
                  setSelection([]);
                  updateParams({ record: undefined, mode: undefined });
                }}
              >
                {academyLabel(copy, section)}
              </BreadcrumbItem>
              <BreadcrumbItem
                className="rounded-lg bg-linear-to-r from-accent-600 to-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm"
                current
              >
                {activeSelection.row.name || academyLabel(copy, activeSelection.resource)}
              </BreadcrumbItem>
            </>
          ) : (
            <BreadcrumbItem
              className="rounded-lg bg-linear-to-r from-accent-600 to-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm"
              current
            >
              {academyLabel(copy, section)}
            </BreadcrumbItem>
          )}
        </Breadcrumb>
        {isFullPage && activeSelection ? (
          <DetailFullPage
            selection={activeSelection}
            user={user}
            locale={locale}
            copy={copy}
            canGoBack={selection.length > 1}
            onBack={() => {
              if (selection.length > 1) {
                setSelection((old) => old.slice(0, -1));
              } else {
                setSelection([]);
                updateParams({ record: undefined, mode: undefined });
              }
            }}
            onSwitchToDrawer={() => updateParams({ mode: undefined })}
            onInspect={(item) => setSelection((old) => [...old, item])}
            onAction={setTarget}
          />
        ) : (
          <>
            <AcademyHeading
              section={section}
              resource={resource}
              copy={copy}
              {...(canCreate
                ? {
                    action: {
                      disabled: requiresBranch && (!branchId || context.isPending),
                      onClick: () => setTarget({ resource, action: 'create' }),
                    },
                  }
                : {})}
            />
            <section className={styles.canvas} aria-label={academyLabel(copy, section)}>
              <Tabs
                value={resource}
                dir={locale === 'ar' ? 'rtl' : 'ltr'}
                onValueChange={(key) => {
                  setSelection([]);
                  setSearch('');
                  updateParams(
                    {
                      tab: key,
                      search: undefined,
                      status: undefined,
                      studentId: undefined,
                      record: undefined,
                      view: undefined,
                    },
                    true,
                  );
                }}
              >
                <div className={styles.canvasHeader}>
                  <TabList aria-label={academyLabel(copy, section)}>
                    {tabs.map((item) => (
                      <Tab key={item} value={item}>
                        <AcademyIcon resource={item} className="size-4" />
                        {academyLabel(copy, item)}
                      </Tab>
                    ))}
                  </TabList>
                  <AcademyResultCount
                    count={
                      list.isError
                        ? undefined
                        : list.data
                          ? (list.data.total ?? list.data.items.length)
                          : undefined
                    }
                    label={list.data?.total !== undefined ? copy.totalRecords : copy.visibleRecords}
                  />
                </div>
                <AcademyPageToolbar model={model} />
                <AcademyPageRecords model={model} />
              </Tabs>
            </section>
          </>
        )}
        <AcademyPageDialogs model={model} />
      </div>
    </div>
  );
}
