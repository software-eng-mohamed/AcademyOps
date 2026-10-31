import { Card } from '@academyops/ui';
import { HealthDistribution, type HealthSegment } from '@academyops/ui/analytics';
import { Activity, ClipboardTick, DocumentUpload, Import, TickCircle } from 'iconsax-react';

import { AnimatedCircularProgressBar } from '@/components/magicui/animated-circular-progress-bar';

import {
  formatCount,
  formatCurrency,
  formatDateTime,
  formatPercentage,
  presentationLabel,
} from './formatters';
import {
  EmptyPanel,
  type OverviewSectionProps,
  PanelHeader,
  panelCardClass,
} from './overview-panel-parts';
export function RecentActivity({ copy, locale, overview }: OverviewSectionProps) {
  return (
    <Card className={panelCardClass} data-dashboard-section="recent-activity">
      <PanelHeader
        description={copy.activity.description}
        title={copy.activity.title}
        trailing={
          <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-blue-50 text-blue-600 ring-1 ring-blue-100 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/20">
            <Activity aria-hidden color="currentColor" size={22} variant="Bulk" />
          </span>
        }
      />

      <div className="px-5 pb-5 sm:px-6 sm:pb-6">
        {overview.recentActivity.length ? (
          <ol className="relative space-y-1 before:absolute before:inset-y-5 before:start-5 before:w-px before:bg-border-button-default">
            {overview.recentActivity.slice(0, 5).map((activity) => (
              <li className="relative flex gap-3 py-2.5" key={activity.id}>
                <span className="relative z-10 grid size-10 shrink-0 place-items-center rounded-[13px] border border-border-button-default bg-background-primary-default text-accent-600 shadow-sm">
                  <Activity aria-hidden color="currentColor" size={18} variant="Bulk" />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm leading-5 font-semibold text-text-primary">
                      {presentationLabel(copy.activity.actions, activity.actionCode)}
                    </p>
                    <time className="shrink-0 text-[10px] font-medium text-text-tertiary tabular-nums">
                      {formatDateTime(activity.createdAt, locale)}
                    </time>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-text-tertiary">
                    <span className="rounded-full bg-background-secondary-default px-2 py-1">
                      {activity.actor?.name ?? copy.activity.systemActor}
                    </span>
                    <span aria-hidden>·</span>
                    <span>{presentationLabel(copy.activity.entities, activity.entityType)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyPanel
            description={copy.activity.empty}
            icon={<Activity aria-hidden color="currentColor" size={23} variant="Bulk" />}
          />
        )}
      </div>
    </Card>
  );
}

export function AcademyHealth({ copy, locale, overview }: OverviewSectionProps) {
  const healthSignals = [
    {
      icon: Import,
      label: copy.academyHealth.importIssues,
      value: overview.academyHealth.openImportIssues,
    },
    {
      icon: TickCircle,
      label: copy.academyHealth.failedOperations,
      value: overview.academyHealth.failedOperations,
    },
    {
      icon: DocumentUpload,
      label: copy.academyHealth.pendingCertificates,
      value: overview.academyHealth.pendingCertificateUploads,
    },
    {
      icon: ClipboardTick,
      label: copy.academyHealth.pendingApprovals,
      value: overview.academyHealth.pendingApprovals,
    },
  ];
  const attendance = overview.trends.attendanceHealth;
  const attendanceItems: HealthSegment[] = [
    {
      label: copy.attendance.healthy,
      tone: 'success',
      value: attendance.healthy,
    },
    {
      label: copy.attendance.nearThreshold,
      tone: 'warning',
      value: attendance.nearThreshold,
    },
    {
      label: copy.attendance.belowMinimum,
      tone: 'danger',
      value: attendance.belowMinimum,
    },
    {
      label: copy.attendance.noData,
      tone: 'neutral',
      value: attendance.noData,
    },
  ];
  const attendanceTotal = attendanceItems.reduce((sum, item) => sum + item.value, 0);
  const healthyRate = attendanceTotal ? attendance.healthy / attendanceTotal : 0;

  return (
    <Card className={panelCardClass} data-dashboard-section="academy-health">
      <PanelHeader description={copy.academyHealth.description} title={copy.academyHealth.title} />

      <div className="px-5 pb-5 sm:px-6 sm:pb-6">
        <div className="grid gap-5 sm:grid-cols-[0.9fr_1.1fr] sm:items-center">
          <section aria-labelledby="attendance-health-title" className="min-w-0">
            <h3 className="sr-only" id="attendance-health-title">
              {copy.attendance.title}
            </h3>
            <div className="flex items-center gap-4">
              <AnimatedCircularProgressBar
                className="size-32 shrink-0 text-xl text-text-primary"
                gaugePrimaryColor="var(--plg-color-brand)"
                gaugeSecondaryColor="var(--plg-color-brand-soft)"
                value={healthyRate * 100}
                valueLabel={formatPercentage(healthyRate, locale)}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-text-primary">{copy.attendance.title}</p>
                <p className="mt-1 text-xs text-text-tertiary">
                  {formatCount(attendanceTotal, locale)} {copy.attendance.enrollments}
                </p>
              </div>
            </div>
            <div className="mt-4">
              <HealthDistribution segments={attendanceItems} />
            </div>
          </section>

          <div className="grid grid-cols-2 gap-2.5">
            {healthSignals.map(({ icon: Icon, label, value }) => (
              <div
                className="rounded-2xl border border-border-button-default bg-background-secondary-default/35 p-3"
                key={label}
              >
                <div className="flex items-start justify-between gap-2">
                  <Icon
                    aria-hidden
                    className={value > 0 ? 'shrink-0 text-warning' : 'shrink-0 text-success'}
                    color="currentColor"
                    size={18}
                    variant="Bulk"
                  />
                  <span className="text-lg font-semibold text-text-primary tabular-nums">
                    {formatCount(value, locale)}
                  </span>
                </div>
                <p className="mt-2 truncate text-[10px] font-medium text-text-tertiary">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <section
          aria-labelledby="approvals-title"
          className="mt-5 border-t border-border-button-default pt-5"
        >
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-text-primary" id="approvals-title">
              {copy.approvals.title}
            </h3>
            <span className="rounded-full bg-background-secondary-default px-2.5 py-1 text-xs font-semibold text-text-secondary tabular-nums">
              {formatCount(overview.approvals.length, locale)}
            </span>
          </div>
          {overview.approvals.length ? (
            <ul className="mt-2 divide-y divide-border-button-default">
              {overview.approvals.slice(0, 3).map((approval) => (
                <li className="flex items-center justify-between gap-4 py-3" key={approval.id}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {presentationLabel(copy.approvals.types, approval.type)}
                    </p>
                    <p className="mt-0.5 text-[10px] text-text-tertiary">
                      {formatDateTime(approval.submittedAt, locale)}
                    </p>
                  </div>
                  {approval.amount && approval.currencyCode ? (
                    <span className="shrink-0 text-xs font-semibold text-text-secondary tabular-nums">
                      {formatCurrency(approval.amount, approval.currencyCode, locale)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-text-tertiary">{copy.approvals.empty}</p>
          )}
        </section>
      </div>
    </Card>
  );
}

export { PriorityQueue, TodaySessions } from './overview-session-panels';
