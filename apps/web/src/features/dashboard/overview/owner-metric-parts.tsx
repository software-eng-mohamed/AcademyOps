'use client';

import { Card, CardContent, CardHeader } from '@academyops/ui';
import { ArrowDown2, ArrowRight2, ArrowUp2 } from 'iconsax-react';
import type { ComponentType, ReactNode } from 'react';
import type { ResponseDashboardControllerOverviewResponse } from '@/api/generated/models/responseDashboardControllerOverviewResponse';
import type { ResponseTrendPoint } from '@/api/generated/models/responseTrendPoint';
import {
  DashboardIconTile,
  type DashboardIconTone,
} from '@/components/application/dashboard/dashboard-icon-tile';
import type { DashboardOverviewCopy } from '@/i18n/dashboard-overview-copy';
import type { Locale } from '@/lib/locales';
import { localeTag } from './formatters';
import type { ChartDatum } from './nivo-charts';

type DashboardIcon = ComponentType<{
  color?: string;
  size?: number | string;
  variant?: 'Bulk';
}>;

const GLASS_CARD = 'owner-glass-card relative overflow-hidden';

export function changeBetweenLastTwo(points: Array<{ value: number }>) {
  const current = points.at(-1)?.value;
  const previous = points.at(-2)?.value;
  if (current === undefined || previous === undefined || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

function trendDate(period: string) {
  const normalized = /^\d{4}-\d{2}$/.test(period) ? `${period}-01T00:00:00Z` : period;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function trendData(points: ResponseTrendPoint[], locale: Locale): ChartDatum[] {
  const formatter = new Intl.DateTimeFormat(localeTag(locale), {
    month: 'short',
    timeZone: 'UTC',
  });

  return points.slice(-6).map((point) => {
    const date = trendDate(point.period);
    return {
      label: date ? formatter.format(date) : point.period,
      value: point.value,
    };
  });
}

export function interpolate(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');
}

const METRIC_BUTTON_TONES: Record<DashboardIconTone, string> = {
  blue: 'hover:!bg-blue-500 hover:!border-blue-400 hover:!text-white hover:shadow-[0_2px_10px_rgba(59,130,246,0.4)] focus-visible:ring-blue-500',
  orange:
    'hover:!bg-orange-500 hover:!border-orange-400 hover:!text-white hover:shadow-[0_2px_10px_rgba(249,115,22,0.4)] focus-visible:ring-orange-500',
  purple:
    'hover:!bg-purple-500 hover:!border-purple-400 hover:!text-white hover:shadow-[0_2px_10px_rgba(168,85,247,0.4)] focus-visible:ring-purple-500',
  emerald:
    'hover:!bg-emerald-500 hover:!border-emerald-400 hover:!text-white hover:shadow-[0_2px_10px_rgba(16,185,129,0.4)] focus-visible:ring-emerald-500',
  pink: 'hover:!bg-pink-500 hover:!border-pink-400 hover:!text-white hover:shadow-[0_2px_10px_rgba(236,72,153,0.4)] focus-visible:ring-pink-500',
  sky: 'hover:!bg-sky-500 hover:!border-sky-400 hover:!text-white hover:shadow-[0_2px_10px_rgba(14,165,233,0.4)] focus-visible:ring-sky-500',
};

export function MetricCard({
  caption,
  delta,
  deltaValue,
  icon: Icon,
  label,
  value,
  tone = 'blue',
  onClick,
  actionHint,
}: {
  caption: string;
  delta?: string | undefined;
  deltaValue?: number | null | undefined;
  icon: DashboardIcon;
  label: string;
  value: string;
  tone?: DashboardIconTone;
  onClick?: () => void;
  actionHint?: string;
}) {
  const DeltaIcon = (deltaValue ?? 0) < 0 ? ArrowDown2 : ArrowUp2;
  const isInteractive = Boolean(onClick);

  return (
    <Card
      className={`${GLASS_CARD} group h-full gap-0 rounded-[20px] py-0 transition-all duration-200 hover:border-white/20 hover:shadow-lg`}
    >
      <CardContent className="flex h-full min-h-[168px] flex-col px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-[var(--owner-card-muted)]">{label}</p>
          <DashboardIconTile tone={tone}>
            <Icon color="currentColor" size={20} variant="Bulk" />
          </DashboardIconTile>
        </div>
        <p className="plg-value-enter mt-2 text-[2rem] leading-none font-semibold tracking-[-0.04em] text-[var(--owner-card-text)] tabular-nums">
          {value}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs text-[var(--owner-card-subtle)]">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
            {delta ? (
              <span className="owner-glass-chip inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-semibold text-[var(--owner-card-text)] tabular-nums backdrop-blur-md">
                <DeltaIcon color="currentColor" size={14} variant="Bulk" />
                {delta}
              </span>
            ) : null}
            <span className="truncate">{caption}</span>
          </div>
          {isInteractive ? (
            <button
              type="button"
              onClick={onClick}
              aria-label={actionHint ? `${label} - ${actionHint}` : label}
              title={actionHint ?? 'تحليل ومقارنة'}
              className={`owner-glass-chip ms-auto flex size-7 shrink-0 items-center justify-center rounded-full border text-[var(--owner-card-muted)] shadow-xs backdrop-blur-md transition-all duration-200 group-hover:border-white/20 group-hover:text-[var(--owner-card-text)] focus-visible:outline-none focus-visible:ring-2 active:scale-95 cursor-pointer ${METRIC_BUTTON_TONES[tone]}`}
            >
              <ArrowRight2 size={13} color="currentColor" className="rtl:rotate-180" />
            </button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function ChartCard({
  children,
  className,
  description,
  icon: Icon,
  meta,
  title,
  tone = 'blue',
  onClick,
  actionHint,
}: {
  children: ReactNode;
  className: string;
  description: string;
  icon: DashboardIcon;
  meta?: string;
  title: string;
  tone?: DashboardIconTone;
  onClick?: () => void;
  actionHint?: string;
}) {
  return (
    <Card
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`${GLASS_CARD} min-w-0 gap-0 rounded-[22px] py-0 ${
        onClick
          ? 'group cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:border-accent-500/50 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500'
          : ''
      } ${className}`}
    >
      <CardHeader className="relative z-10 flex flex-row items-start justify-between gap-4 px-5 pt-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-[var(--owner-card-text)]">
              {title}
            </h2>
            {onClick ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-border-secondary bg-background-secondary-default/80 px-2 py-0.5 text-[11px] font-semibold text-accent-600 transition-colors group-hover:border-accent-500/40 group-hover:bg-accent-500/10">
                <span>{actionHint ?? 'تحليل ومقارنة'}</span>
                <ArrowRight2 size={10} color="currentColor" className="rtl:rotate-180" />
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm leading-5 text-[var(--owner-card-muted)]">{description}</p>
          {meta ? (
            <p className="mt-2 text-xs font-semibold text-accent-700 tabular-nums dark:text-accent-300">
              {meta}
            </p>
          ) : null}
        </div>
        <DashboardIconTile tone={tone}>
          <Icon color="currentColor" size={20} variant="Bulk" />
        </DashboardIconTile>
      </CardHeader>
      <CardContent className="relative z-10 min-h-0 flex-1 px-3 pt-3 pb-4" dir="ltr">
        {children}
      </CardContent>
    </Card>
  );
}

export function buildAgingData(
  overview: ResponseDashboardControllerOverviewResponse,
  copy: DashboardOverviewCopy,
): ChartDatum[] {
  const aging = overview.financeHealth.aging;
  return [
    { color: '#737373', label: copy.finance.agingCurrent, value: Number(aging.current) },
    { color: '#60a5fa', label: copy.finance.agingDays1To30, value: Number(aging.days1To30) },
    { color: '#3b82f6', label: copy.finance.agingDays31To60, value: Number(aging.days31To60) },
    { color: '#2f80ff', label: copy.finance.agingDays61To90, value: Number(aging.days61To90) },
    { color: '#1d4ed8', label: copy.finance.agingDays91Plus, value: Number(aging.days91Plus) },
  ];
}

export function buildSalesPipelineData(
  overview: ResponseDashboardControllerOverviewResponse,
  copy: DashboardOverviewCopy,
): ChartDatum[] {
  return (['NEW', 'OPEN', 'QUALIFIED', 'WON', 'LOST', 'DISQUALIFIED'] as const).map(
    (state, index) => ({
      color: ['#60a5fa', '#2f80ff', '#6366f1', '#22d3ee', '#737373', '#525252'][index] ?? '#737373',
      label: copy.sales.states[state],
      value: overview.salesPipeline.byState[state] ?? 0,
    }),
  );
}

export function buildOwnerActionsData(
  overview: ResponseDashboardControllerOverviewResponse,
  copy: DashboardOverviewCopy,
  attendanceRisk: number,
): ChartDatum[] {
  return [
    {
      color: '#f59e0b',
      label: copy.attention.reasons.INSTALLMENT_OVERDUE ?? 'INSTALLMENT_OVERDUE',
      value: overview.financeHealth.overdueEnrollmentCount,
    },
    {
      color: '#fb923c',
      label: copy.academyHealth.pendingApprovals,
      value: overview.academyHealth.pendingApprovals,
    },
    {
      color: '#60a5fa',
      label: copy.attention.reasons.ATTENDANCE_BELOW_MINIMUM ?? 'ATTENDANCE_BELOW_MINIMUM',
      value: attendanceRisk,
    },
    {
      color: '#ef4444',
      label: copy.academyHealth.failedOperations,
      value: overview.academyHealth.failedOperations,
    },
    {
      color: '#2f80ff',
      label: copy.academyHealth.importIssues,
      value: overview.academyHealth.openImportIssues,
    },
    {
      color: '#a78bfa',
      label: copy.sales.overdueFollowUps,
      value: overview.salesPipeline.overdueFollowUps,
    },
  ].toSorted((first, second) => second.value - first.value);
}
