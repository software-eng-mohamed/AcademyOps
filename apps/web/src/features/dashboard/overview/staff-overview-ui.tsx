'use client';

import type { OverviewCount, WorkspaceOverview } from '@academyops/api-client/workspace-overview';
import { Calendar1, Clock, type Icon, InfoCircle } from 'iconsax-react';

import type { ReactNode } from 'react';
import {
  DashboardIconTile,
  type DashboardIconTone,
} from '@/components/application/dashboard/dashboard-icon-tile';
import { Chip } from '@/components/base/badges/chip';
import { ButtonLink } from '@/components/base/buttons/button';
import { getStaffOverviewCopy } from '@/i18n/staff-overview-copy';
import { getWorkspaceOverviewCopy } from '@/i18n/workspace-overview-copy';
import type { Locale } from '@/lib/locales';
import { cx } from '@/utils/cx';
import { formatCount, formatDateTime, localeTag } from './formatters';
import styles from './staff-overview-styles';

export const statusColors: Record<string, string> = {
  SCHEDULED: '#3b82f6',
  COMPLETED: '#14b8a6',
  DRAFT: '#94a3b8',
  CANCELLED: '#e879a2',
  ACTIVE: '#3b82f6',
  PENDING_APPROVAL: '#f59e0b',
  POSTPONED: '#a78bfa',
  PRESENT: '#14b8a6',
  LATE: '#f59e0b',
  ABSENT: '#e879a2',
  EXCUSED: '#a78bfa',
  UNMARKED: '#94a3b8',
  NEW: '#60a5fa',
  OPEN: '#3b82f6',
  QUALIFIED: '#a78bfa',
  WON: '#14b8a6',
  LOST: '#94a3b8',
  DISQUALIFIED: '#e879a2',
};

export const staffMoney = (value: string | number, locale: Locale) =>
  new Intl.NumberFormat(localeTag(locale), {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));

export const staffDate = (
  value: string,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' },
) =>
  new Intl.DateTimeFormat(localeTag(locale), { timeZone: 'Africa/Cairo', ...options }).format(
    new Date(value.length === 10 ? `${value}T12:00:00Z` : value),
  );

export function Panel({
  title,
  hint,
  icon: IconComponent,
  children,
  tone = 'blue',
  featured = false,
  className,
  bodyClassName,
}: {
  title: string;
  hint?: string;
  icon: Icon;
  children: ReactNode;
  tone?: DashboardIconTone;
  featured?: boolean;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cx(styles.card, featured && styles.featured, className)} aria-label={title}>
      <header className={styles.header}>
        <DashboardIconTile tone={tone}>
          <IconComponent variant="Bulk" size={20} color="currentColor" />
        </DashboardIconTile>
        <div className="min-w-0">
          <h2>{title}</h2>
          {hint ? <p className={styles.muted}>{hint}</p> : null}
        </div>
      </header>
      <div className={cx(styles.body, bodyClassName)}>{children}</div>
    </section>
  );
}

export function Empty({ locale, message }: { locale: Locale; message?: string }) {
  const copy = getStaffOverviewCopy(locale);
  return (
    <div className={styles.empty}>
      <strong>{message ?? copy.noData}</strong>
      <p className={styles.muted}>{copy.noDataHint}</p>
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <p className={styles.note}>
      <InfoCircle variant="Bulk" size={16} color="currentColor" aria-hidden />
      {children}
    </p>
  );
}

export function Mini({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={styles.mini}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function Status({ state, locale }: { state: string; locale: Locale }) {
  return (
    <Chip
      color={
        ['COMPLETED', 'ACTIVE', 'POSTED'].includes(state)
          ? 'lime'
          : ['CANCELLED', 'ABSENT'].includes(state)
            ? 'rose'
            : 'blue'
      }
      variant="caption"
    >
      {getStaffOverviewCopy(locale).states[state] ?? getStaffOverviewCopy(locale).unknown}
    </Chip>
  );
}

export function Pills({ items, locale }: { items: OverviewCount[]; locale: Locale }) {
  const copy = getStaffOverviewCopy(locale);
  return items.length ? (
    <div className={styles.pills}>
      {items.map((d) => (
        <span key={d.key} className={styles.pill}>
          {copy.states[d.key] ?? copy.unknown}
          <strong>{formatCount(d.value, locale)}</strong>
        </span>
      ))}
    </div>
  ) : (
    <Empty locale={locale} />
  );
}

export function Agenda({
  queue,
  title,
  locale,
  hideEmptyCount = false,
  sessionLinks = false,
  paymentLinks = false,
  attendanceLinks = false,
}: {
  queue: WorkspaceOverview['queue'];
  title: string;
  locale: Locale;
  hideEmptyCount?: boolean;
  sessionLinks?: boolean;
  paymentLinks?: boolean;
  attendanceLinks?: boolean;
}) {
  const copy = getStaffOverviewCopy(locale);
  const base = getWorkspaceOverviewCopy(locale);
  return (
    <Panel title={title} hint={base.timezone} icon={Calendar1}>
      {queue?.items.length ? (
        <ul className={styles.list}>
          {queue.items.map((item) => (
            <li key={item.id} className={styles.listItem}>
              <div className={styles.row}>
                <div>
                  <h3>
                    {sessionLinks || paymentLinks || attendanceLinks ? (
                      <ButtonLink
                        variant="ghost"
                        href={`/${locale}/${attendanceLinks ? 'attendance?sessionId' : paymentLinks ? 'payments?record' : 'sessions?record'}=${encodeURIComponent(item.id)}`}
                      >
                        <bdi>{item.title ?? copy.session}</bdi>
                      </ButtonLink>
                    ) : (
                      <bdi>{item.title ?? copy.session}</bdi>
                    )}
                  </h3>
                  <p className={styles.muted}>
                    <bdi>
                      {item.amount !== null
                        ? staffMoney(item.amount, locale)
                        : item.subtitle || base.noRoom}
                    </bdi>
                  </p>
                </div>
                <Status state={item.status} locale={locale} />
              </div>
              <div className={styles.sessionDetail}>
                <Clock variant="Bulk" size={15} color="currentColor" aria-hidden />
                <time dateTime={item.at}>{formatDateTime(item.at, locale)}</time>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Empty locale={locale} message={queue ? base.queues[queue.kind].empty : copy.none} />
      )}
      {queue && (!hideEmptyCount || queue.items.length > 0 || queue.total > 0) ? (
        <p className={styles.foot}>
          {copy.preview
            .replace('{shown}', formatCount(queue.items.length, locale))
            .replace('{total}', formatCount(queue.total, locale))}
        </p>
      ) : null}
    </Panel>
  );
}

export { RankedValues, SeriesChart, StateDonut, StateRanking, series } from './staff-chart-panels';
