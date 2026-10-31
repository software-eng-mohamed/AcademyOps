'use client';

import { isPlgApiError } from '@academyops/api-client/http';
import type {
  WorkspaceOverview,
  WorkspaceOverviewRole,
} from '@academyops/api-client/workspace-overview';
import {
  getWorkspaceOverviewControllerOverviewV1QueryKey,
  useWorkspaceOverviewControllerOverviewV1,
} from '@/api/generated/dashboard/dashboard';
import { Button } from '@/components/base/buttons/button';
import { getDashboardOverviewCopy } from '@/i18n/dashboard-overview-copy';
import { useDocumentLocale } from '@/i18n/use-document-locale';
import { getWorkspaceOverviewCopy } from '@/i18n/workspace-overview-copy';
import { DashboardBreadcrumbs } from './dashboard-breadcrumbs';
import { DashboardNotifications } from './dashboard-notifications';
import { OverviewWelcomeCard } from './overview-welcome-card';
import styles from './sales-overview-styles';
import { WorkspaceOverviewContent } from './workspace-overview-content';

export function WorkspaceOverviewPage({
  initialOverview,
  role,
  userId,
  userName,
}: {
  initialOverview: WorkspaceOverview | null;
  role: WorkspaceOverviewRole;
  userId: string;
  userName: string;
}) {
  const locale = useDocumentLocale();
  const shared = getDashboardOverviewCopy(locale);
  const feedback = getWorkspaceOverviewCopy(locale);
  const copy = getWorkspaceOverviewCopy(locale).roles[role];
  const initial = initialOverview?.role === role ? initialOverview : null;
  const query = useWorkspaceOverviewControllerOverviewV1(role, {
    query: {
      queryKey: [...getWorkspaceOverviewControllerOverviewV1QueryKey(role), userId],
      ...(initial
        ? {
            initialData: { data: initial, status: 200 as const, headers: new Headers() },
            initialDataUpdatedAt: Date.parse(initial.generatedAt),
          }
        : {}),
      gcTime: 0,
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      refetchInterval: (current) => (current.state.error ? false : 60_000),
    },
  });
  const accessLost = isPlgApiError(query.error) && [401, 403].includes(query.error.status);
  const overview = !accessLost && query.data?.data.role === role ? query.data.data : null;
  return (
    <div className={styles.root} data-overview-role={role} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <header className="px-3 pt-4 pb-5 sm:px-6 sm:pt-5 xl:px-8">
        <div className="mx-auto w-full max-w-[1600px]">
          <DashboardBreadcrumbs
            ariaLabel={shared.breadcrumb.ariaLabel}
            dashboardHref={`/${locale}/dashboard`}
            dashboardLabel={shared.breadcrumb.dashboard}
            overviewLabel={shared.breadcrumb.overview}
          />
          <OverviewWelcomeCard
            title={copy.title}
            greeting={shared.welcome}
            userName={userName}
            description={copy.description}
            actions={<DashboardNotifications copy={shared.notifications} locale={locale} />}
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
                {accessLost ? feedback.forbidden : overview ? feedback.stale : feedback.error}
              </p>
              <Button
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
                type="button"
                variant="secondary"
              >
                {feedback.retry}
              </Button>
            </div>
          ) : null}
          {overview ? (
            <WorkspaceOverviewContent overview={overview} locale={locale} />
          ) : query.isPending ? (
            <div className="min-h-64 p-6 text-sm text-text-secondary" role="status">
              {feedback.loading}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
