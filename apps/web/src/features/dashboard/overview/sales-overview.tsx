'use client';

import { isPlgApiError } from '@academyops/api-client/http';
import {
  getSalesDashboardControllerOverviewV1QueryKey,
  useSalesDashboardControllerOverviewV1,
} from '@/api/generated/dashboard/dashboard';
import type { ResponseSalesDashboardControllerOverviewResponse } from '@/api/generated/models/responseSalesDashboardControllerOverviewResponse';
import { Button } from '@/components/base/buttons/button';
import { getDashboardOverviewCopy } from '@/i18n/dashboard-overview-copy';
import { getSalesOverviewCopy } from '@/i18n/sales-overview-copy';
import { useDocumentLocale } from '@/i18n/use-document-locale';
import { DashboardBreadcrumbs } from './dashboard-breadcrumbs';
import { DashboardNotifications } from './dashboard-notifications';
import { OverviewWelcomeCard } from './overview-welcome-card';
import { SalesOverviewContent } from './sales-overview-content';
import styles from './sales-overview-styles';

export function SalesOverview({
  initialOverview,
  userName,
  userId,
}: {
  initialOverview: ResponseSalesDashboardControllerOverviewResponse | null;
  userName: string;
  userId: string;
}) {
  const locale = useDocumentLocale();
  const sharedCopy = getDashboardOverviewCopy(locale);
  const copy = getSalesOverviewCopy(locale);
  const query = useSalesDashboardControllerOverviewV1({
    query: {
      queryKey: [...getSalesDashboardControllerOverviewV1QueryKey(), userId],
      ...(initialOverview
        ? {
            initialData: { data: initialOverview, status: 200 as const, headers: new Headers() },
            initialDataUpdatedAt: Date.parse(initialOverview.generatedAt),
          }
        : {}),
      gcTime: 0,
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      refetchInterval: (current) => (current.state.error ? false : 60_000),
    },
  });
  const accessLost = isPlgApiError(query.error) && [401, 403].includes(query.error.status);
  const overview = accessLost ? undefined : query.data?.data;

  return (
    <div className={styles.root} data-overview-role="SALES" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <header className="px-3 pt-4 pb-5 sm:px-6 sm:pt-5 xl:px-8">
        <div className="mx-auto w-full max-w-[1600px]">
          <DashboardBreadcrumbs
            ariaLabel={sharedCopy.breadcrumb.ariaLabel}
            dashboardHref={`/${locale}/dashboard`}
            dashboardLabel={sharedCopy.breadcrumb.dashboard}
            overviewLabel={sharedCopy.breadcrumb.overview}
          />
          <OverviewWelcomeCard
            actions={<DashboardNotifications copy={sharedCopy.notifications} locale={locale} />}
            title={copy.title}
            greeting={copy.welcome}
            userName={userName}
            description={
              overview?.scope === 'ASSIGNED' ? copy.assignedDescription : copy.accessibleDescription
            }
          />
        </div>
      </header>
      <div className="px-3 pb-4 sm:px-6 sm:pb-6 xl:px-8">
        <div
          className="mx-auto w-full max-w-[1600px] min-w-0 rounded-[28px] border border-border-button-default p-3 shadow-card sm:p-5 xl:p-6"
          data-dashboard-canvas
        >
          {query.isError ? (
            <div
              className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-button-default bg-background-secondary-default p-4"
              role="alert"
            >
              <p className="text-sm text-text-secondary">
                {accessLost ? copy.forbidden : overview ? copy.stale : copy.error}
              </p>
              <Button
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
                type="button"
                variant="secondary"
              >
                {copy.retry}
              </Button>
            </div>
          ) : null}
          {overview ? (
            <SalesOverviewContent locale={locale} overview={overview} />
          ) : query.isPending ? (
            <div className="min-h-64 rounded-2xl bg-background-secondary-default p-6" role="status">
              <p className="text-sm text-text-secondary">{copy.loading}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
