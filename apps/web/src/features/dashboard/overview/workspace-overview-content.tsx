import type {
  WorkspaceMetricKey,
  WorkspaceOverview,
} from '@academyops/api-client/workspace-overview';
import type { Icon } from 'iconsax-react';
import {
  Calendar1,
  CalendarTick,
  Clock,
  DocumentText,
  MessageText,
  Profile2User,
  Receipt,
  TickCircle,
  ToggleOnCircle,
  Wifi,
} from 'iconsax-react';
import dynamic from 'next/dynamic';
import { StatCards } from '@/components/application/dashboard/stat-cards';
import { Chip } from '@/components/base/badges/chip';
import { getWorkspaceOverviewCopy } from '@/i18n/workspace-overview-copy';
import type { Locale } from '@/lib/locales';
import { formatCount, formatDateTime, localeTag } from './formatters';
import styles from './sales-overview-styles';

const StaffOverviewContent = dynamic(() =>
  import('./staff-overview-content').then((m) => m.StaffOverviewContent),
);

const StudentOverviewContent = dynamic(() =>
  import('./student-overview-content').then((m) => m.StudentOverviewContent),
);

function bulk(IconComponent: Icon) {
  return function BulkIcon({ className }: { className?: string }) {
    return (
      <IconComponent
        aria-hidden
        className={className}
        color="currentColor"
        size={20}
        variant="Bulk"
      />
    );
  };
}
const icons = {
  calendar: bulk(Calendar1),
  people: bulk(Profile2User),
  document: bulk(DocumentText),
  check: bulk(TickCircle),
  receipt: bulk(Receipt),
  wifi: bulk(Wifi),
  message: bulk(MessageText),
  toggle: bulk(ToggleOnCircle),
};
const metricIcons: Record<WorkspaceMetricKey, keyof typeof icons> = {
  sessionsToday: 'calendar',
  sessionsNext7Days: 'calendar',
  completedSessionsThisMonth: 'check',
  activeEnrollments: 'people',
  pendingEnrollments: 'document',
  draftEnrollments: 'document',
  completedEnrollments: 'check',
  activeCohorts: 'people',
  openWindowsToday: 'calendar',
  completedSessionsToday: 'check',
  paymentsToday: 'receipt',
  paymentsThisMonth: 'receipt',
  reversedPaymentsThisMonth: 'document',
};
const tones = ['blue', 'purple', 'emerald'] as const;

export function WorkspaceOverviewContent({
  overview,
  locale,
}: {
  overview: WorkspaceOverview;
  locale: Locale;
}) {
  const copy = getWorkspaceOverviewCopy(locale);
  const queue = overview.queue;
  const channel = overview.channel;
  const queueCopy = queue ? copy.queues[queue.kind] : null;
  return (
    <div className="space-y-5" data-workspace-overview-content>
      <StatCards
        className="gap-3 sm:grid-cols-3 sm:gap-4"
        columns={1}
        variant="overview"
        stats={
          channel
            ? [
                {
                  icon: icons.wifi,
                  label: copy.channel.state,
                  value: copy.channel.states[channel.state] ?? copy.unknownStatus,
                  valueKind: 'status',
                  tone: 'blue',
                },
                {
                  icon: icons.message,
                  label: copy.channel.readiness,
                  value: channel.otpAvailable ? copy.channel.ready : copy.channel.notReady,
                  valueKind: 'status',
                  tone: channel.otpAvailable ? 'emerald' : 'orange',
                },
                {
                  icon: icons.toggle,
                  label: copy.channel.enabled,
                  value: channel.enabled ? copy.channel.on : copy.channel.off,
                  valueKind: 'status',
                  tone: 'purple',
                },
              ]
            : overview.metrics.map((metric, index) => ({
                icon: icons[metricIcons[metric.key]],
                label:
                  overview.role === 'STUDENT' && metric.key === 'activeEnrollments'
                    ? copy.studentActive.label
                    : copy.metrics[metric.key].label,
                caption:
                  overview.role === 'STUDENT' && metric.key === 'activeEnrollments'
                    ? copy.studentActive.caption
                    : copy.metrics[metric.key].caption,
                value: formatCount(metric.value, locale),
                tone: tones[index % tones.length] ?? 'blue',
              }))
        }
      />
      {overview.role === 'STUDENT' && overview.student ? (
        <StudentOverviewContent data={overview.student} locale={locale} />
      ) : null}
      {overview.role !== 'STUDENT' && overview.staff ? (
        <StaffOverviewContent data={overview.staff} overview={overview} locale={locale} />
      ) : null}
      {queue &&
      queueCopy &&
      !(overview.role === 'STUDENT' && overview.student) &&
      !overview.staff ? (
        <section className={styles.followUps} aria-labelledby="workspace-queue-title">
          <div className={styles.followUpsHeader}>
            <div className="flex min-w-0 items-center gap-3">
              <span className={styles.sectionIcon}>
                <Calendar1 aria-hidden color="currentColor" size={20} variant="Bulk" />
              </span>
              <div>
                <h2 className={styles.sectionTitle} id="workspace-queue-title">
                  {queueCopy.title}
                </h2>
                <p className={styles.sectionDescription}>{queueCopy.description}</p>
              </div>
            </div>
          </div>
          {queue.items.length ? (
            <ul className={styles.queue}>
              {queue.items.map((item) => (
                <li key={item.id} className={styles.queueItem}>
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span aria-hidden className={styles.leadIcon}>
                      {queue.kind === 'PAYMENTS' ? (
                        <Receipt color="currentColor" size={20} variant="Bulk" />
                      ) : (
                        <Calendar1 color="currentColor" size={20} variant="Bulk" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className={styles.leadName}>
                        <bdi>
                          {item.title || (queue.kind === 'PAYMENTS' ? copy.payment : copy.session)}
                        </bdi>
                      </p>
                      <p className={styles.sectionDescription}>
                        {item.amount !== null ? (
                          <bdi>
                            {new Intl.NumberFormat(localeTag(locale), {
                              style: 'currency',
                              currency: 'EGP',
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            }).format(Number(item.amount))}
                          </bdi>
                        ) : (
                          <bdi>{item.subtitle || copy.noRoom}</bdi>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className={styles.queueMeta}>
                    <time dateTime={item.at}>{formatDateTime(item.at, locale)}</time>
                    <Chip
                      color={
                        ['COMPLETED', 'POSTED'].includes(item.status)
                          ? 'lime'
                          : ['REVERSED', 'REJECTED'].includes(item.status)
                            ? 'yellow'
                            : 'blue'
                      }
                      variant="caption"
                    >
                      {copy.status[item.status] ?? copy.unknownStatus}
                    </Chip>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>
                <CalendarTick aria-hidden color="currentColor" size={26} variant="Bulk" />
              </span>
              <div>
                <h3 className={styles.emptyTitle}>{copy.emptyTitle}</h3>
                <p className={styles.emptyDescription}>{queueCopy.empty}</p>
              </div>
            </div>
          )}
          <div className={styles.footer}>
            <p>
              {copy.preview
                .replace('{shown}', formatCount(queue.items.length, locale))
                .replace('{total}', formatCount(queue.total, locale))}
            </p>
            <span className="inline-flex items-center gap-1.5">
              <Clock aria-hidden color="currentColor" size={14} variant="Bulk" />
              {copy.timezone}
            </span>
          </div>
        </section>
      ) : null}
      {channel && !overview.staff ? (
        <section className={styles.followUps} aria-labelledby="channel-title">
          <div className={styles.followUpsHeader}>
            <div>
              <h2 className={styles.sectionTitle} id="channel-title">
                {copy.channel.title}
              </h2>
              <p className={styles.sectionDescription}>{copy.channel.description}</p>
            </div>
          </div>
          {channel.needsQr ? (
            <p className="px-5 pb-4 text-sm text-text-primary">{copy.channel.qrNeeded}</p>
          ) : null}
          <dl className="grid gap-5 px-5 pb-5 sm:grid-cols-3">
            <div>
              <dt className={styles.sectionDescription}>{copy.channel.phone}</dt>
              <dd className="mt-2 text-sm text-text-primary">
                <bdi>{channel.phoneMasked || copy.channel.noPhone}</bdi>
              </dd>
            </div>
            {[
              ['lastConnectedAt', copy.channel.lastConnected],
              ['lastHeartbeatAt', copy.channel.heartbeat],
            ].map(([key, label]) => {
              const at = channel[key as 'lastConnectedAt' | 'lastHeartbeatAt'];
              return (
                <div key={key}>
                  <dt className={styles.sectionDescription}>{label}</dt>
                  <dd className="mt-2 text-sm text-text-primary">
                    {at ? (
                      <time dateTime={at}>{formatDateTime(at, locale)}</time>
                    ) : (
                      copy.channel.never
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      ) : null}
    </div>
  );
}
