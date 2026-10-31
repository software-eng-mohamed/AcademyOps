'use client';

import { Calendar1, Chart2, Clock, Location, TickCircle, Video } from 'iconsax-react';
import { ButtonLink } from '@/components/base/buttons/button';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { managementText } from '@/i18n/management-copy';
import { getStaffOverviewCopy } from '@/i18n/staff-overview-copy';

import { formatDateTime, localeTag } from './formatters';
import type { Props } from './staff-learning-overviews';
import styles from './staff-overview-styles';
import {
  Agenda,
  Empty,
  Note,
  Panel,
  Pills,
  SeriesChart,
  StateDonut,
  Status,
  series,
  staffDate,
  statusColors,
} from './staff-overview-ui';
export function AttendanceOverview({ data, queue, locale }: Props<'ATTENDANCE'>) {
  const c = getStaffOverviewCopy(locale);
  const states = ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED', 'UNMARKED'];
  return (
    <div className={styles.stack} data-staff-layout="ATTENDANCE">
      <div className={`${styles.grid} ${styles.reverse} ${styles.attendanceGrid}`}>
        <Panel
          title={c.attendance.today}
          hint={c.attendance.todayHint}
          icon={TickCircle}
          tone="emerald"
        >
          <StateDonut data={data.recordsToday} locale={locale} title={c.attendance.records} />
          <Note>{c.attendance.note}</Note>
        </Panel>
        <Panel
          title={c.attendance.trend}
          hint={`${c.last7} · ${c.attendance.trendHint}`}
          icon={Chart2}
        >
          <SeriesChart
            title={c.attendance.trend}
            locale={locale}
            data={data.days.map((d) => ({
              ...d,
              label: staffDate(d.date, locale, { month: 'numeric', day: 'numeric' }),
            }))}
            series={states.map((key) =>
              series(key.toLowerCase(), c.states[key] ?? c.unknown, statusColors[key]),
            )}
          />
          <h3 className="mt-6 mb-3 text-sm font-medium">{c.attendance.windows}</h3>
          <Pills items={data.windows} locale={locale} />
        </Panel>
      </div>
      <Agenda
        queue={queue}
        title={c.attendance.agenda}
        locale={locale}
        attendanceLinks
        hideEmptyCount
      />
      <div>
        <ButtonLink variant="secondary" href={`/${locale}/attendance`}>
          {managementText(locale, 'attendance')}
        </ButtonLink>
      </div>
    </div>
  );
}

export function TrainerOverview({ data, queue, locale }: Props<'TRAINER'>) {
  const c = getStaffOverviewCopy(locale);
  const next = data.nextSession;
  const hours = new Intl.NumberFormat(localeTag(locale), { maximumFractionDigits: 1 }).format(
    data.days.reduce((n, d) => n + d.minutes, 0) / 60,
  );
  return (
    <div className={styles.stack} data-staff-layout="TRAINER">
      <div className={`${styles.grid} ${styles.equal} ${styles.trainerGrid}`}>
        <Panel title={c.trainer.next} icon={Calendar1} featured>
          {next ? (
            <>
              <p className={styles.muted}>
                <time dateTime={next.startsAt}>
                  {staffDate(next.startsAt, locale, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                </time>
              </p>
              <h3 className={styles.sessionTitle}>
                <bdi>{next.title ?? c.session}</bdi>
              </h3>
              <Status state={next.status} locale={locale} />
              <div className={styles.sessionDetail}>
                <span>
                  <Clock size={18} variant="Bulk" color="currentColor" aria-hidden />
                  {staffDate(next.startsAt, locale, { hour: 'numeric', minute: '2-digit' })}
                  {next.endsAt
                    ? ` – ${staffDate(next.endsAt, locale, { hour: 'numeric', minute: '2-digit' })}`
                    : null}
                </span>
                <span>
                  <Video size={18} variant="Bulk" color="currentColor" aria-hidden />
                  {c.states[next.deliveryMode] ?? c.unknown}
                </span>
              </div>
              {next.deliveryMode !== 'ONLINE' ? (
                <div className={styles.sessionDetail}>
                  <Location size={18} variant="Bulk" color="currentColor" aria-hidden />
                  <bdi>{next.room ?? c.trainer.noRoom}</bdi>
                </div>
              ) : null}
              <div className="mt-5 flex flex-wrap gap-2">
                <ButtonLink
                  variant="secondary"
                  href={`/${locale}/sessions?record=${encodeURIComponent(next.id)}`}
                >
                  {getAcademyCopy(locale).details}
                </ButtonLink>
                <ButtonLink
                  variant="secondary"
                  href={`/${locale}/attendance?sessionId=${encodeURIComponent(next.id)}`}
                >
                  {managementText(locale, 'attendance')}
                </ButtonLink>
              </div>
            </>
          ) : (
            <Empty locale={locale} message={c.trainer.nextEmpty} />
          )}
          <h3 className="mt-7 mb-3 text-sm font-medium">{c.trainer.formats}</h3>
          <Pills items={data.deliveryModes} locale={locale} />
        </Panel>
        <Panel
          title={c.trainer.workload}
          hint={`${c.weekAheadHint} · ${c.trainer.workloadHint}`}
          icon={Chart2}
          tone="purple"
        >
          <p className="mb-3 flex items-baseline gap-2">
            <strong className="text-2xl font-semibold tabular-nums">{hours}</strong>
            <span className={styles.muted}>{c.trainer.hours}</span>
          </p>
          <SeriesChart
            title={c.trainer.workload}
            unit="hours"
            locale={locale}
            data={data.days.map((d) => ({
              label: staffDate(d.date, locale, { month: 'numeric', day: 'numeric' }),
              hours: d.minutes / 60,
            }))}
            series={[series('hours', c.hours, '#a78bfa')]}
          />
        </Panel>
      </div>
      <div className={`${styles.grid} ${styles.trainerGrid}`}>
        <Agenda queue={queue} title={c.trainer.agenda} locale={locale} sessionLinks />
        <Panel
          title={c.trainer.recent}
          hint={c.trainer.recentHint}
          icon={TickCircle}
          tone="emerald"
        >
          {data.recentSessions.length ? (
            <ul className={styles.list}>
              {data.recentSessions.map((s) => (
                <li className={styles.listItem} key={s.id}>
                  <div className={styles.row}>
                    <h3>
                      <ButtonLink
                        variant="ghost"
                        size="small"
                        className="h-auto max-w-full whitespace-normal text-start [&_span]:min-w-0 [&_span]:shrink"
                        href={`/${locale}/sessions?record=${encodeURIComponent(s.id)}`}
                      >
                        <bdi>{s.title ?? c.session}</bdi>
                      </ButtonLink>
                    </h3>
                    <TickCircle size={18} variant="Bulk" color="var(--sales-green)" aria-hidden />
                  </div>
                  <p className={styles.muted}>
                    <time dateTime={s.startsAt}>{formatDateTime(s.startsAt, locale)}</time>
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <Empty locale={locale} />
          )}
          <div className="mt-5">
            <ButtonLink variant="secondary" href={`/${locale}/sessions`}>
              {managementText(locale, 'sessions')}
            </ButtonLink>
          </div>
        </Panel>
      </div>
    </div>
  );
}
