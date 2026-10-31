import { Card, StatusBadge } from '@academyops/ui';

import { Calendar2, ClipboardTick, TickCircle } from 'iconsax-react';

import {
  contextLabel,
  formatCount,
  formatDateTime,
  formatSessionTime,
  presentationLabel,
} from './formatters';
import {
  EmptyPanel,
  type OverviewSectionProps,
  PanelHeader,
  panelCardClass,
  sessionStatusTone,
  severityRail,
  severityTone,
} from './overview-panel-parts';
export function PriorityQueue({ copy, locale, overview }: OverviewSectionProps) {
  return (
    <Card className={panelCardClass} data-dashboard-section="priority-queue">
      <PanelHeader
        description={copy.attention.description}
        title={copy.attention.title}
        trailing={
          <StatusBadge
            label={copy.attention.total.replace(
              '{count}',
              formatCount(overview.attention.total, locale),
            )}
            size="small"
            status={overview.attention.total > 0 ? 'warning' : 'success'}
          />
        }
      />

      <div className="px-3 pb-3 sm:px-5 sm:pb-5">
        {overview.attention.items.length ? (
          <ol className="space-y-2.5">
            {overview.attention.items.slice(0, 6).map((item, index) => (
              <li
                className="group relative overflow-hidden rounded-2xl border border-border-button-default bg-background-secondary-default/30 p-3.5 transition-colors duration-150 hover:border-border-strong hover:bg-background-secondary-default/55 sm:p-4"
                key={item.id}
              >
                <span
                  aria-hidden
                  className={`absolute inset-y-3 start-0 w-1 rounded-e-full ${severityRail[item.severity]}`}
                />
                <div className="flex min-w-0 items-center gap-3.5 ps-1">
                  <span className="grid size-10 shrink-0 place-items-center rounded-[13px] bg-accent-50 text-accent-600 ring-1 ring-accent-100 dark:bg-accent-950/40 dark:text-accent-300 dark:ring-accent-500/20">
                    <ClipboardTick aria-hidden color="currentColor" size={19} variant="Bulk" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="text-[10px] font-semibold text-text-tertiary tabular-nums">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <p className="truncate text-sm font-semibold text-text-primary">
                        {presentationLabel(copy.attention.reasons, item.reasonCode)}
                      </p>
                    </div>
                    <p className="mt-1 truncate text-xs text-text-tertiary">
                      {contextLabel(item.context, item.entityType)} · {item.entityType}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <StatusBadge
                      label={copy.severity[item.severity]}
                      size="small"
                      status={severityTone[item.severity]}
                    />
                    <time className="text-[10px] font-medium text-text-tertiary tabular-nums">
                      {formatDateTime(item.occurredAt, locale)}
                    </time>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyPanel
            description={copy.attention.empty}
            icon={<TickCircle aria-hidden color="currentColor" size={23} variant="Bulk" />}
          />
        )}
      </div>
    </Card>
  );
}

export function TodaySessions({ copy, locale, overview }: OverviewSectionProps) {
  return (
    <Card className={panelCardClass} data-dashboard-section="today-sessions">
      <PanelHeader
        description={copy.sessions.description}
        title={copy.sessions.title}
        trailing={
          <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/20">
            <Calendar2 aria-hidden color="currentColor" size={22} variant="Bulk" />
          </span>
        }
      />

      <div className="px-4 pb-4 sm:px-5 sm:pb-5">
        {overview.todaySessions.length ? (
          <ol className="space-y-2.5">
            {overview.todaySessions.slice(0, 4).map((session) => {
              const attendancePercent = session.attendance.expected
                ? Math.min(100, (session.attendance.checkedIn / session.attendance.expected) * 100)
                : 0;
              const sessionName =
                session.program?.name ??
                session.cohort?.name ??
                session.cohort?.code ??
                copy.sessions.unknownSession;
              const sessionMeta = [session.room?.name, session.trainer?.name]
                .filter(Boolean)
                .join(' · ');

              return (
                <li
                  className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-3 rounded-2xl border border-border-button-default bg-background-secondary-default/30 p-3.5"
                  key={session.id}
                >
                  <time className="grid h-11 place-items-center rounded-xl bg-background-primary-default text-sm font-semibold text-text-primary shadow-sm tabular-nums">
                    {formatSessionTime(session.startsAt, locale, copy.sessions.unknownTime)}
                  </time>
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-semibold text-text-primary">
                        {sessionName}
                      </p>
                      <StatusBadge
                        label={presentationLabel(copy.sessions.statuses, session.status)}
                        size="small"
                        status={sessionStatusTone(session.status)}
                      />
                    </div>
                    <p className="mt-1 truncate text-xs text-text-tertiary">
                      {sessionMeta || copy.sessions.detailsUnavailable}
                    </p>
                    <div className="mt-3 flex items-center gap-3">
                      <div
                        aria-label={copy.sessions.attendanceProgress}
                        aria-valuemax={session.attendance.expected}
                        aria-valuemin={0}
                        aria-valuenow={session.attendance.checkedIn}
                        className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-background-tertiary-default"
                        role="progressbar"
                      >
                        <div
                          className="h-full rounded-full bg-accent-600"
                          style={{ width: `${attendancePercent}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-semibold text-text-tertiary tabular-nums">
                        {formatCount(session.attendance.checkedIn, locale)}/
                        {formatCount(session.attendance.expected, locale)}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <EmptyPanel
            description={copy.sessions.empty}
            icon={<Calendar2 aria-hidden color="currentColor" size={23} variant="Bulk" />}
          />
        )}
      </div>
    </Card>
  );
}
