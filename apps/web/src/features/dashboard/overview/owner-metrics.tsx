'use client';

import {
  Activity,
  Chart21,
  ChartSuccess,
  MoneyRecive,
  Profile2User,
  StatusUp,
  WalletMoney,
  Warning2,
} from 'iconsax-react';
import { useState } from 'react';

import type { ResponseDashboardControllerOverviewResponse } from '@/api/generated/models/responseDashboardControllerOverviewResponse';
import type { DashboardOverviewCopy } from '@/i18n/dashboard-overview-copy';
import type { Locale } from '@/lib/locales';
import type { ExecutiveMetricKey } from './executive-comparison-data';
import { ExecutiveDrilldownDrawer } from './executive-drilldown-drawer';
import { formatCount, formatCurrency, formatSignedPercent } from './formatters';
import {
  RoundedCollectionsChart,
  RoundedDonutChart,
  RoundedHorizontalBars,
  SmoothEnrollmentChart,
} from './nivo-charts';
import {
  buildAgingData,
  buildOwnerActionsData,
  buildSalesPipelineData,
  ChartCard,
  changeBetweenLastTwo,
  interpolate,
  MetricCard,
  trendData,
} from './owner-metric-parts';

type Props = {
  copy: DashboardOverviewCopy;
  isFetching: boolean;
  locale: Locale;
  overview: ResponseDashboardControllerOverviewResponse;
};

export function OwnerMetrics({ copy, isFetching, locale, overview }: Props) {
  const [selectedMetric, setSelectedMetric] = useState<ExecutiveMetricKey | null>(null);
  const isRtl = locale === 'ar';
  const actionHint = isRtl ? 'تحليل ومقارنة' : 'Compare & Drilldown';
  const collectionsChange = changeBetweenLastTwo(overview.trends.collections);
  const formatNumber = (value: number) => formatCount(value, locale);
  const formatMoney = (value: number) => formatCurrency(value, overview.kpis.currencyCode, locale);
  const noDataLabel = copy.attendance.noData;
  const attendanceRisk = overview.trends.attendanceHealth.belowMinimum;

  const attendanceData = [
    { name: copy.attendance.healthy, value: overview.trends.attendanceHealth.healthy },
    { name: copy.attendance.nearThreshold, value: overview.trends.attendanceHealth.nearThreshold },
    { name: copy.attendance.belowMinimum, value: attendanceRisk },
    { name: copy.attendance.noData, value: overview.trends.attendanceHealth.noData },
  ];
  const agingData = buildAgingData(overview, copy);
  const salesPipelineData = buildSalesPipelineData(overview, copy);
  const ownerActionsData = buildOwnerActionsData(overview, copy, attendanceRisk);

  return (
    <section
      aria-busy={isFetching}
      aria-label={copy.summary.title}
      className="min-w-0 space-y-4"
      data-dashboard-section="owner-metrics"
    >
      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          actionHint={actionHint}
          caption={
            collectionsChange === null
              ? copy.summary.noComparison
              : copy.summary.versusPreviousMonth
          }
          delta={
            collectionsChange === null ? undefined : formatSignedPercent(collectionsChange, locale)
          }
          deltaValue={collectionsChange}
          icon={MoneyRecive}
          label={copy.kpis.netCollections}
          onClick={() => setSelectedMetric('netCollections')}
          value={formatMoney(Number(overview.kpis.netCollectionsThisMonth))}
        />
        <MetricCard
          actionHint={actionHint}
          caption={interpolate(copy.summary.overdueAccounts, {
            count: formatNumber(overview.financeHealth.overdueEnrollmentCount),
          })}
          icon={Warning2}
          label={copy.kpis.overdueReceivables}
          onClick={() => setSelectedMetric('overdueReceivables')}
          value={formatMoney(Number(overview.financeHealth.overdueBalance))}
          tone="orange"
        />
        <MetricCard
          actionHint={actionHint}
          caption={interpolate(copy.summary.studentsAtRisk, {
            count: formatNumber(attendanceRisk),
          })}
          icon={Profile2User}
          tone="purple"
          label={copy.kpis.activeStudents}
          onClick={() => setSelectedMetric('activeStudents')}
          value={formatNumber(overview.kpis.activeStudents)}
        />
        <MetricCard
          actionHint={actionHint}
          caption={interpolate(copy.summary.leadsStatus, {
            open: formatNumber(overview.salesPipeline.openLeads),
            overdue: formatNumber(overview.salesPipeline.overdueFollowUps),
          })}
          icon={ChartSuccess}
          tone="emerald"
          label={copy.kpis.convertedLeads}
          onClick={() => setSelectedMetric('convertedLeads')}
          value={formatNumber(overview.salesPipeline.convertedLeadsThisMonth)}
        />
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-12">
        <ChartCard
          actionHint={actionHint}
          className="h-[390px] xl:col-span-7"
          description={copy.charts.enrollmentsDescription}
          icon={StatusUp}
          onClick={() => setSelectedMetric('enrollmentsTrend')}
          tone="purple"
          title={copy.charts.enrollmentsTitle}
        >
          <div className="h-full min-h-0">
            <SmoothEnrollmentChart
              ariaLabel={copy.charts.enrollmentsTitle}
              data={trendData(overview.trends.enrollments, locale)}
              emptyLabel={noDataLabel}
              isRtl={isRtl}
              valueFormatter={formatNumber}
            />
          </div>
        </ChartCard>

        <ChartCard
          actionHint={actionHint}
          className="h-[390px] xl:col-span-5"
          description={copy.charts.collectionsDescription}
          icon={WalletMoney}
          onClick={() => setSelectedMetric('collectionsTrend')}
          title={copy.charts.collectionsTitle}
        >
          <div className="h-full min-h-0">
            <RoundedCollectionsChart
              ariaLabel={copy.charts.collectionsTitle}
              data={trendData(overview.trends.collections, locale)}
              emptyLabel={noDataLabel}
              isRtl={isRtl}
              valueFormatter={formatMoney}
            />
          </div>
        </ChartCard>

        <ChartCard
          actionHint={actionHint}
          className="h-[390px] xl:col-span-7"
          description={copy.charts.receivablesAgingDescription}
          icon={Warning2}
          onClick={() => setSelectedMetric('receivablesAging')}
          tone="orange"
          meta={interpolate(copy.finance.dueNext30Days, {
            amount: formatMoney(Number(overview.financeHealth.dueNext30Days)),
          })}
          title={copy.charts.receivablesAgingTitle}
        >
          <RoundedHorizontalBars
            ariaLabel={copy.charts.receivablesAgingTitle}
            data={agingData}
            emptyLabel={noDataLabel}
            isRtl={isRtl}
            showValues={false}
            valueFormatter={formatMoney}
          />
        </ChartCard>

        <ChartCard
          actionHint={actionHint}
          className="h-[390px] xl:col-span-5"
          description={copy.charts.salesPipelineDescription}
          icon={Chart21}
          onClick={() => setSelectedMetric('salesPipeline')}
          tone="emerald"
          title={copy.charts.salesPipelineTitle}
        >
          <RoundedHorizontalBars
            ariaLabel={copy.charts.salesPipelineTitle}
            data={salesPipelineData}
            emptyLabel={noDataLabel}
            isRtl={isRtl}
            valueFormatter={formatNumber}
          />
        </ChartCard>

        <ChartCard
          actionHint={actionHint}
          className="h-[370px] xl:col-span-5"
          description={copy.charts.attendanceDescription}
          icon={Activity}
          onClick={() => setSelectedMetric('attendanceHealth')}
          tone="sky"
          title={copy.charts.attendanceTitle}
        >
          <RoundedDonutChart
            ariaLabel={copy.charts.attendanceTitle}
            centerLabel={formatNumber(
              attendanceData.reduce((total, item) => total + item.value, 0),
            )}
            data={attendanceData}
            emptyLabel={noDataLabel}
            isRtl={isRtl}
            valueFormatter={formatNumber}
          />
        </ChartCard>

        <ChartCard
          actionHint={actionHint}
          className="h-[370px] xl:col-span-7"
          description={copy.charts.ownerActionsDescription}
          icon={Warning2}
          onClick={() => setSelectedMetric('ownerActions')}
          tone="orange"
          title={copy.charts.ownerActionsTitle}
        >
          <RoundedHorizontalBars
            ariaLabel={copy.charts.ownerActionsTitle}
            data={ownerActionsData}
            emptyLabel={copy.attention.empty}
            isRtl={isRtl}
            valueFormatter={formatNumber}
          />
        </ChartCard>
      </div>

      <ExecutiveDrilldownDrawer
        key={selectedMetric}
        locale={locale}
        metricKey={selectedMetric}
        onClose={() => setSelectedMetric(null)}
        overview={overview}
      />
    </section>
  );
}
