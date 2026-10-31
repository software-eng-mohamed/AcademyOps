'use client';

import type { ResponseDashboardControllerOverviewResponse } from '@/api/generated/models/responseDashboardControllerOverviewResponse';
import { getDashboardOverviewCopy } from '@/i18n/dashboard-overview-copy';
import { useDocumentLocale } from '@/i18n/use-document-locale';
import { DashboardBreadcrumbs } from './dashboard-breadcrumbs';
import { DashboardNotifications } from './dashboard-notifications';
import { AcademyHealth, PriorityQueue, RecentActivity, TodaySessions } from './overview-operations';
import { OverviewWelcomeCard } from './overview-welcome-card';
import { OwnerMetrics } from './owner-metrics';

export function DashboardOverview({
  initialOverview,
  userName,
}: {
  initialOverview: ResponseDashboardControllerOverviewResponse;
  userName: string;
}) {
  const locale = useDocumentLocale();
  const copy = getDashboardOverviewCopy(locale);
  const overview = initialOverview;

  return (
    <div className="min-h-full" data-overview-role="OWNER">
      <header className="px-3 pt-4 pb-6 sm:px-6 sm:pt-5 xl:px-8">
        <div className="mx-auto w-full max-w-[1600px]">
          <DashboardBreadcrumbs
            ariaLabel={copy.breadcrumb.ariaLabel}
            dashboardHref={`/${locale}/dashboard`}
            dashboardLabel={copy.breadcrumb.dashboard}
            overviewLabel={copy.breadcrumb.overview}
          />

          <OverviewWelcomeCard
            actions={<DashboardNotifications copy={copy.notifications} locale={locale} />}
            title={copy.pageTitle}
            greeting={copy.welcome}
            description={copy.welcomeDescription}
            userName={userName}
          />
        </div>
      </header>

      <div className="px-3 pb-4 sm:px-6 sm:pb-6 xl:px-8">
        <div
          className="mx-auto w-full max-w-[1600px] min-w-0 rounded-[28px] border border-border-button-default p-3 shadow-card sm:p-5 xl:p-6"
          data-dashboard-canvas
        >
          <OwnerMetrics copy={copy} isFetching={false} locale={locale} overview={overview} />
          <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-2">
            <PriorityQueue copy={copy} locale={locale} overview={overview} />
            <TodaySessions copy={copy} locale={locale} overview={overview} />
            <RecentActivity copy={copy} locale={locale} overview={overview} />
            <AcademyHealth copy={copy} locale={locale} overview={overview} />
          </div>
        </div>
      </div>
    </div>
  );
}
