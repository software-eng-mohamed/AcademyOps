import type { ResponseDashboardControllerOverviewResponse } from '@/api/generated/models/responseDashboardControllerOverviewResponse';
import { getDashboardOverviewCopy } from '@/i18n/dashboard-overview-copy';
import type { Locale } from '@/lib/locales';
import { buildMonthlyComparison, type ComparisonRow, finiteMetric } from './executive-trend-data';
import { formatCount, formatCurrency } from './formatters';

export type { ComparisonRow } from './executive-trend-data';

export type ExecutiveMetricKey =
  | 'netCollections'
  | 'overdueReceivables'
  | 'activeStudents'
  | 'convertedLeads'
  | 'enrollmentsTrend'
  | 'collectionsTrend'
  | 'receivablesAging'
  | 'salesPipeline'
  | 'attendanceHealth'
  | 'ownerActions';

export type MetricBreakdown = { label: string; formattedValue: string; rawValue: number | null };

export type ExecutiveMetricDetail = {
  key: ExecutiveMetricKey;
  title: string;
  subtitle: string;
  currentValue: string;
  monthly: ComparisonRow[];
  breakdown: MetricBreakdown[];
  actionLabel: string;
  actionHref: string;
};

export function getExecutiveMetricDetail(
  key: ExecutiveMetricKey,
  overview: ResponseDashboardControllerOverviewResponse,
  locale: Locale,
): ExecutiveMetricDetail {
  const isAr = locale === 'ar';
  const copy = getDashboardOverviewCopy(locale);
  const money = (value: number) => formatCurrency(value, overview.kpis.currencyCode, locale);
  const count = (value: number) => formatCount(value, locale);
  const formatted = (value: unknown, format = count) => {
    const numeric = finiteMetric(value);
    return numeric === null ? '—' : format(numeric);
  };
  const row = (label: string, value: unknown, format = count): MetricBreakdown => ({
    label,
    formattedValue: formatted(value, format),
    rawValue: finiteMetric(value),
  });
  const snapshot = isAr
    ? 'القيم الفعلية في آخر تحديث للوحة التحكم.'
    : 'Recorded values from the latest dashboard snapshot.';
  const base = {
    key,
    subtitle: snapshot,
    monthly: [] as ComparisonRow[],
    breakdown: [] as MetricBreakdown[],
  };
  const attendance = overview.trends.attendanceHealth;
  const attendanceRows = [
    row(copy.attendance.healthy, attendance.healthy),
    row(copy.attendance.nearThreshold, attendance.nearThreshold),
    row(copy.attendance.belowMinimum, attendance.belowMinimum),
    row(copy.attendance.noData, attendance.noData),
  ];

  switch (key) {
    case 'netCollections':
    case 'collectionsTrend':
      return {
        ...base,
        title: isAr ? 'صافي التحصيلات والإيرادات' : 'Net Collections & Revenue',
        subtitle: isAr
          ? 'صافي تحصيلات الشهر الحالي والسجل الشهري المتاح.'
          : 'Current-month net collections and the available monthly history.',
        currentValue: formatted(overview.kpis.netCollectionsThisMonth, money),
        monthly: buildMonthlyComparison(overview.trends.collections, locale, money),
        actionLabel: isAr ? 'عرض الحسابات المالية' : 'Open Finance',
        actionHref: `/${locale}/finance`,
      };
    case 'overdueReceivables':
    case 'receivablesAging': {
      const aging = overview.financeHealth.aging;
      return {
        ...base,
        title: isAr ? 'المستحقات ومخاطر أعمار الديون' : 'Overdue Receivables & Aging',
        currentValue: formatted(overview.financeHealth.overdueBalance, money),
        breakdown: [
          row(copy.finance.agingCurrent, aging.current, money),
          row(copy.finance.agingDays1To30, aging.days1To30, money),
          row(copy.finance.agingDays31To60, aging.days31To60, money),
          row(copy.finance.agingDays61To90, aging.days61To90, money),
          row(copy.finance.agingDays91Plus, aging.days91Plus, money),
        ],
        actionLabel: isAr ? 'عرض الحسابات المالية' : 'Open Finance',
        actionHref: `/${locale}/finance`,
      };
    }
    case 'activeStudents':
      return {
        ...base,
        title: copy.kpis.activeStudents,
        currentValue: formatted(overview.kpis.activeStudents),
        breakdown: attendanceRows,
        actionLabel: isAr ? 'عرض الطلاب' : 'Open Students',
        actionHref: `/${locale}/students`,
      };
    case 'enrollmentsTrend': {
      const monthly = buildMonthlyComparison(overview.trends.enrollments, locale, count);
      return {
        ...base,
        title: copy.charts.enrollmentsTitle,
        subtitle: isAr
          ? 'الالتحاقات الجديدة المسجلة شهريًا. القيمة المعروضة تخص أحدث شهر متاح.'
          : 'Recorded new enrollments by month. The value shown is the latest available month.',
        currentValue: monthly[0]?.formattedValue ?? '—',
        monthly,
        actionLabel: isAr ? 'عرض الالتحاقات' : 'Open Enrollments',
        actionHref: `/${locale}/enrollments`,
      };
    }
    case 'convertedLeads':
    case 'salesPipeline':
      return {
        ...base,
        title: key === 'convertedLeads' ? copy.kpis.convertedLeads : copy.charts.salesPipelineTitle,
        subtitle:
          key === 'convertedLeads'
            ? isAr
              ? 'الفرص المحولة هذا الشهر والتوزيع الحالي لحالات المبيعات.'
              : 'Leads converted this month and the current pipeline states.'
            : isAr
              ? 'الفرص المفتوحة والتوزيع الحالي لحالات المبيعات.'
              : 'Open leads and the current pipeline states.',
        currentValue: formatted(
          key === 'convertedLeads'
            ? overview.salesPipeline.convertedLeadsThisMonth
            : overview.salesPipeline.openLeads,
        ),
        breakdown: (['NEW', 'OPEN', 'QUALIFIED', 'WON', 'LOST', 'DISQUALIFIED'] as const).map(
          (state) => row(copy.sales.states[state], overview.salesPipeline.byState[state]),
        ),
        actionLabel: isAr ? 'عرض فرص المبيعات' : 'Open Leads',
        actionHref: `/${locale}/leads`,
      };
    case 'attendanceHealth':
      return {
        ...base,
        title: copy.charts.attendanceTitle,
        subtitle: isAr
          ? 'معدل الحضور الحالي وتوزيع الطلاب حسب حالة الحضور.'
          : 'Current attendance rate and student attendance categories.',
        currentValue: formatted(overview.kpis.attendanceRate, (value) =>
          new Intl.NumberFormat(isAr ? 'ar-EG' : 'en-US', {
            style: 'percent',
            maximumFractionDigits: 1,
          }).format(value / 100),
        ),
        breakdown: attendanceRows,
        actionLabel: isAr ? 'عرض الحضور' : 'Open Attendance',
        actionHref: `/${locale}/attendance`,
      };
    case 'ownerActions':
      return {
        ...base,
        title: copy.charts.ownerActionsTitle,
        subtitle: isAr
          ? 'عناصر المتابعة والأعداد التشغيلية الحالية. قد تتداخل الفئات.'
          : 'Attention items and current operational counts. Categories may overlap.',
        currentValue: formatted(overview.attention.total),
        breakdown: [
          row(copy.academyHealth.pendingApprovals, overview.academyHealth.pendingApprovals),
          row(copy.academyHealth.failedOperations, overview.academyHealth.failedOperations),
          row(copy.academyHealth.importIssues, overview.academyHealth.openImportIssues),
          row(copy.sales.overdueFollowUps, overview.salesPipeline.overdueFollowUps),
        ],
        actionLabel: isAr ? 'عرض التقارير' : 'Open Reports',
        actionHref: `/${locale}/reports`,
      };
  }
}
