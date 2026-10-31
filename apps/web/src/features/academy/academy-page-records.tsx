'use client';

import { AcademyTabPanel as TabPanel } from '@academyops/ui/academy';
import { getAcademyPageColumns } from './academy-page-columns';
import { AcademyEmpty, AcademyLoading, AcademyRecords } from './academy-records';
import styles from './academy-styles';
import { ErrorNotice } from './academy-ui';
import { AcademyPagination } from './academy-workspace';

import type { AcademyPageModel } from './use-academy-page';

export function AcademyPageRecords({ model }: { model: AcademyPageModel }) {
  const {
    locale,
    copy,
    params,
    resource,
    setSearch,
    history,
    setTarget,
    page,
    cursor,
    context,
    branchId,
    list,
    view,
    updateParams,
    inspect,
    canCreate,
    requiresBranch,
  } = model;
  return (
    <TabPanel key={resource} value={resource} className="mt-0">
      {canCreate && requiresBranch && context.isSuccess && !branchId ? (
        <p className="py-4 text-sm text-ink-muted">{copy.noBranch}</p>
      ) : null}
      {canCreate && requiresBranch && context.isError ? (
        <ErrorNotice error={context.error} copy={copy} retry={() => void context.refetch()} />
      ) : null}
      <div className={styles.records} data-view={view}>
        {list.isError ? (
          <ErrorNotice error={list.error} copy={copy} retry={() => void list.refetch()} />
        ) : list.isPending ? (
          <AcademyLoading label={copy.loading} />
        ) : !list.data.items.length ? (
          <AcademyEmpty
            copy={copy}
            {...(params.get('search') || params.get('status') || params.get('studentId')
              ? {
                  onReset: () => {
                    setSearch('');
                    updateParams(
                      { search: undefined, status: undefined, studentId: undefined },
                      true,
                    );
                  },
                }
              : {})}
            {...(canCreate && (!requiresBranch || branchId)
              ? { onCreate: () => setTarget({ resource, action: 'create' }) }
              : {})}
          />
        ) : (
          <AcademyRecords
            rows={list.data.items}
            columns={getAcademyPageColumns(model)}
            resource={resource}
            copy={copy}
            view={view}
            busy={list.isFetching}
            onInspect={inspect}
            locale={locale}
          />
        )}
      </div>
      <AcademyPagination
        page={page}
        {...(list.data?.pages ? { totalPages: list.data.pages } : {})}
        pageLabel={copy.pageNumber.replace('{page}', String(page))}
        labels={{
          label: copy.pagination,
          previous: copy.previous,
          next: copy.next,
          page: copy.goToPage,
        }}
        hasPrevious={page > 1 && (resource === 'registrations' || history.length > 0)}
        hasNext={Boolean(list.data?.nextCursor || (list.data?.pages && page < list.data.pages))}
        disabled={list.isFetching}
        onChange={(nextPage) => {
          if (resource === 'registrations') {
            updateParams({ page: String(nextPage) });
            return;
          }
          if (nextPage < page) {
            const previous = history.at(-1);
            updateParams({
              cursor: previous === '_' ? undefined : previous,
              page: String(page - 1),
              trail: history.slice(0, -1).join('~') || undefined,
            });
          } else {
            updateParams({
              cursor: list.data?.nextCursor ?? undefined,
              page: String(page + 1),
              trail: [...history, cursor ?? '_'].join('~'),
            });
          }
        }}
      />
    </TabPanel>
  );
}
