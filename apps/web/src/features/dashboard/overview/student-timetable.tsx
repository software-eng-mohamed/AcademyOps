'use client';

import type { StudentOverview, StudentSession } from '@academyops/api-client/workspace-overview';

import { Calendar1, Clock, Location } from 'iconsax-react';

import { Chip } from '@/components/base/badges/chip';
import { ButtonLink } from '@/components/base/buttons/button';
import { Tab, TabList, TabPanel, Tabs } from '@/components/base/tabs/tabs';

import { studentText } from '@/i18n/student-copy';

import type { Locale } from '@/lib/locales';
import { formatCount } from './formatters';
import {
  type Copy,
  date,
  Empty,
  Section,
  Status,
  studentDayKey,
  studentWeekDays,
} from './student-overview-parts';
import styles from './student-overview-styles';
export function NextSession({
  session,
  locale,
  copy,
}: {
  session: StudentSession | null;
  locale: Locale;
  copy: Copy;
}) {
  return (
    <Section title={copy.nextSession} icon={Calendar1}>
      {session ? (
        <>
          <p className={styles.date}>
            {date(session.startsAt, locale, { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h3 className={styles.sessionTitle}>
            <bdi>{session.title ?? copy.session}</bdi>
          </h3>
          <p className={styles.muted}>
            <bdi>{session.cohort}</bdi>
          </p>
          <div className={styles.sessionMeta}>
            <span>
              <Clock aria-hidden size={17} color="currentColor" variant="Bulk" />
              <bdi>
                {date(session.startsAt, locale, { hour: 'numeric', minute: '2-digit' })}
                {session.endsAt
                  ? ` – ${date(session.endsAt, locale, { hour: 'numeric', minute: '2-digit' })}`
                  : ''}
              </bdi>
            </span>
            <span>
              <Location aria-hidden size={17} color="currentColor" variant="Bulk" />
              {session.deliveryMode === 'ONLINE'
                ? copy.modes.ONLINE
                : (session.room ?? copy.roomPending)}
            </span>
            <Chip color="soft">{copy.modes[session.deliveryMode] ?? copy.session}</Chip>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <ButtonLink
              variant="secondary"
              href={`/${locale}/schedule?record=${encodeURIComponent(session.id)}`}
            >
              {studentText(locale, 'schedule')}
            </ButtonLink>
            <ButtonLink
              variant="secondary"
              href={`/${locale}/attendance?sessionId=${encodeURIComponent(session.id)}`}
            >
              {studentText(locale, 'attendance')}
            </ButtonLink>
          </div>
        </>
      ) : (
        <Empty title={copy.nextEmpty} hint={copy.nextHint} />
      )}
    </Section>
  );
}

export function StudentTimetable({
  schedule,
  locale,
  copy,
}: {
  schedule: StudentOverview['schedule'];
  locale: Locale;
  copy: Copy;
}) {
  const days = studentWeekDays(schedule.from);
  return (
    <Section title={copy.schedule} hint={copy.scheduleHint} icon={Calendar1}>
      <Tabs defaultSelectedKey={studentDayKey(schedule.from)} key={schedule.from}>
        <div className={styles.tabs}>
          <TabList aria-label={copy.schedule}>
            {days.map((day) => (
              <Tab id={studentDayKey(day)} key={day}>
                <span className={styles.tabLabel}>
                  <span>{date(day, locale, { weekday: 'short' })}</span>
                  <strong>{date(day, locale, { day: 'numeric' })}</strong>
                </span>
              </Tab>
            ))}
          </TabList>
        </div>
        {days.map((day) => {
          const sessions = schedule.items.filter(
            (s) => studentDayKey(s.startsAt) === studentDayKey(day),
          );
          return (
            <TabPanel id={studentDayKey(day)} key={day}>
              {sessions.length ? (
                <ul className={styles.rows}>
                  {sessions.map((session) => (
                    <li className={styles.row} key={session.id}>
                      <div className={styles.rowMain}>
                        <time className={styles.time} dateTime={session.startsAt}>
                          {date(session.startsAt, locale, { hour: 'numeric', minute: '2-digit' })}
                        </time>
                        <div>
                          <h3>
                            <ButtonLink
                              variant="ghost"
                              className="h-auto whitespace-normal text-start"
                              href={`/${locale}/schedule?record=${encodeURIComponent(session.id)}`}
                            >
                              <bdi>{session.title ?? copy.session}</bdi>
                            </ButtonLink>
                          </h3>
                          <p className={styles.muted}>
                            <bdi>{session.cohort}</bdi>
                          </p>
                        </div>
                      </div>
                      <div className={styles.rowEnd}>
                        <Status state={session.status} copy={copy} />
                        <span className={styles.muted}>
                          {session.deliveryMode === 'ONLINE'
                            ? copy.modes.ONLINE
                            : (session.room ?? copy.roomPending)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty
                  title={
                    schedule.total > schedule.items.length
                      ? copy.scheduleIncomplete
                      : copy.noSessions
                  }
                  hint={schedule.total > schedule.items.length ? undefined : copy.noSessionsHint}
                />
              )}
            </TabPanel>
          );
        })}
      </Tabs>
      <div className="mt-5">
        <ButtonLink variant="secondary" href={`/${locale}/schedule`}>
          {studentText(locale, 'schedule')}
        </ButtonLink>
      </div>
      {schedule.total > schedule.items.length ? (
        <p className={`${styles.muted} ${styles.note}`}>
          {copy.scheduleLimit
            .replace('{shown}', formatCount(schedule.items.length, locale))
            .replace('{total}', formatCount(schedule.total, locale))}
        </p>
      ) : null}
    </Section>
  );
}
