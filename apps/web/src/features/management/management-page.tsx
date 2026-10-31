'use client';

import { Element3 } from 'iconsax-react';
import { Breadcrumb, BreadcrumbItem } from '@/components/base/breadcrumb/breadcrumb';
import styles from '@/features/academy/academy-styles';
import { sectionPaths } from './config';
import { ManagementDetailFullPage } from './detail-full-page';
import { ManagementPageDialogs } from './management-page-dialogs';
import { ManagementPageHeading } from './management-page-heading';
import { ManagementPageRecords } from './management-page-records';
import { useManagementPageState } from './use-management-page-state';

export function ManagementPage(props: Parameters<typeof useManagementPageState>[0]) {
  const model = useManagementPageState(props);
  const {
    section,
    user,
    locale,
    copy,
    t,
    sessionId,
    resource,
    selection,
    setSelection,
    setTarget,
    updateParams,
    group,
    list,
    params,
  } = model;

  const isFullPage = params.get('mode') === 'page' && Boolean(selection);

  return (
    <div className={styles.page} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <div className={styles.container}>
        <Breadcrumb aria-label={t(group)} className="mb-6 min-h-10 [&>ol]:px-0">
          <BreadcrumbItem
            className="mx-0 px-0 py-1 text-sm font-semibold text-text-secondary hover:text-text-primary"
            href={`/${locale}/dashboard`}
          >
            <Element3 aria-hidden size={16} color="currentColor" variant="Bulk" />
            {copy.dashboard}
          </BreadcrumbItem>
          <BreadcrumbItem className="mx-0 px-0 py-1 text-sm font-semibold text-text-secondary">
            {t(group)}
          </BreadcrumbItem>
          {isFullPage && selection ? (
            <>
              <BreadcrumbItem
                className="mx-0 px-0 py-1 text-sm font-semibold text-text-secondary hover:text-text-primary"
                href={`/${locale}/${sectionPaths[section] ?? section}`}
                onClick={() => {
                  setSelection(undefined);
                  updateParams({ record: undefined, mode: undefined });
                }}
              >
                {t(section)}
              </BreadcrumbItem>
              <BreadcrumbItem
                className="rounded-lg bg-linear-to-r from-accent-600 to-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm"
                current
              >
                {resource === 'exports' ? t(selection.name) : selection.name}
              </BreadcrumbItem>
            </>
          ) : (
            <BreadcrumbItem
              className="rounded-lg bg-linear-to-r from-accent-600 to-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm"
              current
            >
              {t(section)}
            </BreadcrumbItem>
          )}
        </Breadcrumb>
        {isFullPage && selection ? (
          <ManagementDetailFullPage
            resource={resource}
            row={list.data?.items.find((item) => item.id === selection.id) ?? selection}
            user={user}
            locale={locale}
            onClose={() => {
              setSelection(undefined);
              updateParams({ record: undefined, mode: undefined });
            }}
            onSwitchToDrawer={() => updateParams({ mode: undefined })}
            onAction={(actionTarget) =>
              setTarget({ ...actionTarget, ...(sessionId ? { sessionId } : {}) })
            }
          />
        ) : (
          <>
            <ManagementPageHeading model={model} />
            <div className={styles.canvas}>
              <ManagementPageRecords model={model} />
            </div>
          </>
        )}
        <ManagementPageDialogs model={model} />
      </div>
    </div>
  );
}
