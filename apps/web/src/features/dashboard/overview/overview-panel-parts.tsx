import type { ReactNode } from 'react';
import type { ResponseDashboardControllerOverviewResponse } from '@/api/generated/models/responseDashboardControllerOverviewResponse';

import type { DashboardOverviewCopy } from '@/i18n/dashboard-overview-copy';
import type { Locale } from '@/lib/locales';

export const severityTone = {
  CRITICAL: 'critical',
  INFO: 'info',
  WARNING: 'warning',
} as const;

export const severityRail = {
  CRITICAL: 'bg-danger',
  INFO: 'bg-info',
  WARNING: 'bg-warning',
} as const;

export const panelCardClass =
  'relative h-full min-w-0 gap-0 overflow-hidden rounded-[24px] border-accent-500/15 bg-background-primary-default py-0 shadow-card before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-linear-to-r before:from-accent-600 before:to-blue-400';

export function sessionStatusTone(status: string) {
  if (status === 'COMPLETED') return 'success' as const;
  if (status === 'IN_PROGRESS') return 'info' as const;
  if (status === 'CANCELLED') return 'critical' as const;
  return 'neutral' as const;
}

export function PanelHeader({
  description,
  title,
  trailing,
}: {
  description: string;
  title: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
      <div className="min-w-0">
        <h2 className="text-xl font-semibold tracking-[-0.025em] text-text-primary">{title}</h2>
        <p className="mt-1 text-sm leading-5 text-text-tertiary">{description}</p>
      </div>
      {trailing}
    </div>
  );
}

export function EmptyPanel({ description, icon }: { description: string; icon: ReactNode }) {
  return (
    <div className="relative grid min-h-52 place-items-center overflow-hidden rounded-[20px] border border-dashed border-border-strong bg-background-secondary-default/30 px-6 py-8 text-center">
      <div className="relative max-w-72 px-5">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent-50 text-accent-600 ring-1 ring-accent-100 dark:bg-accent-950/40 dark:text-accent-300 dark:ring-accent-500/20">
          {icon}
        </span>
        <p className="mt-3 text-sm leading-6 font-medium text-text-secondary">{description}</p>
      </div>
    </div>
  );
}

export type OverviewSectionProps = {
  copy: DashboardOverviewCopy;
  locale: Locale;
  overview: ResponseDashboardControllerOverviewResponse;
};
