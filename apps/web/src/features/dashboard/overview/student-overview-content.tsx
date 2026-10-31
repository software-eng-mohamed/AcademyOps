'use client';

import type { StudentOverview } from '@academyops/api-client/workspace-overview';

import { Book1, Chart2, Receipt, TickCircle, Wallet2 } from 'iconsax-react';
import dynamic from 'next/dynamic';

import { DashboardIconTile } from '@/components/application/dashboard/dashboard-icon-tile';

import { ButtonLink } from '@/components/base/buttons/button';

import { studentMoney } from '@/features/student/formatters';
import { studentText } from '@/i18n/student-copy';
import { getStudentOverviewCopy } from '@/i18n/student-overview-copy';
import type { Locale } from '@/lib/locales';
import { formatCount } from './formatters';
import { type Copy, date, Empty, Section, Status } from './student-overview-parts';
import styles from './student-overview-styles';
import { NextSession, StudentTimetable } from './student-timetable';

export { studentMoney } from '@/features/student/formatters';

const AttendanceChart = dynamic(
  () => import('./student-overview-charts').then((m) => m.StudentAttendanceChart),
  { ssr: false },
);

const PaymentsChart = dynamic(
  () => import('./student-overview-charts').then((m) => m.StudentPaymentsChart),
  { ssr: false },
);

function Fees({
  finance,
  locale,
  copy,
}: {
  finance: StudentOverview['finance'];
  locale: Locale;
  copy: Copy;
}) {
  return (
    <Section title={copy.finance} icon={Wallet2} tone="emerald">
      {finance ? (
        <>
          <p className={styles.muted}>
            {Number(finance.balance) < 0 ? copy.creditBalance : copy.balance}
          </p>
          <p className={styles.amount}>
            <bdi>{studentMoney(Math.abs(Number(finance.balance)), locale)}</bdi>
          </p>
          <dl className={styles.details}>
            <div>
              <dt>{copy.charges}</dt>
              <dd>
                <bdi>{studentMoney(finance.totalDebits, locale)}</bdi>
              </dd>
            </div>
            <div>
              <dt>{copy.credits}</dt>
              <dd>
                <bdi>{studentMoney(finance.totalCredits, locale)}</bdi>
              </dd>
            </div>
            <div>
              <dt>{copy.overdue}</dt>
              <dd>
                <bdi>{studentMoney(finance.installments.overdueAmount, locale)}</bdi>
              </dd>
            </div>
          </dl>
          <p className={`${styles.muted} ${styles.note}`}>{copy.financeNote}</p>
          <div className="mt-5">
            <ButtonLink variant="secondary" href={`/${locale}/finance`}>
              {studentText(locale, 'finance')}
            </ButtonLink>
          </div>
        </>
      ) : (
        <Empty title={copy.unavailable} />
      )}
    </Section>
  );
}

export function StudentOverviewContent({
  data,
  locale,
}: {
  data: StudentOverview;
  locale: Locale;
}) {
  const copy = getStudentOverviewCopy(locale);
  const attendance = data.attendance;
  return (
    <div className={styles.content} data-student-overview>
      <div className={styles.grid}>
        <NextSession session={data.nextSession} locale={locale} copy={copy} />
        <Fees finance={data.finance} locale={locale} copy={copy} />
      </div>
      <StudentTimetable schedule={data.schedule} locale={locale} copy={copy} />
      <div className={styles.grid}>
        <Section title={copy.attendance} hint={copy.attendanceHint} icon={TickCircle} tone="purple">
          {attendance ? (
            <>
              {attendance.denominator ? (
                <>
                  <div className={styles.chart}>
                    <AttendanceChart attendance={attendance} locale={locale} />
                  </div>
                  <p className={`${styles.muted} text-center`}>
                    {copy.counted
                      .replace('{attended}', formatCount(attendance.numerator, locale))
                      .replace('{total}', formatCount(attendance.denominator, locale))}
                  </p>
                </>
              ) : (
                <Empty title={copy.attendanceEmpty} />
              )}
              <dl className={styles.attendanceStats}>
                {(['present', 'late', 'absent'] as const).map((key) => (
                  <div key={key}>
                    <dd>{formatCount(attendance[key], locale)}</dd>
                    <dt>{copy[key]}</dt>
                  </div>
                ))}
              </dl>
              <p className={styles.muted}>
                {copy.excused}: {formatCount(attendance.excused, locale)} · {copy.unmarked}:{' '}
                {formatCount(attendance.unmarked, locale)}
              </p>
              <p className={`${styles.muted} ${styles.note}`}>{copy.attendanceNote}</p>
            </>
          ) : (
            <Empty title={copy.unavailable} />
          )}
        </Section>
        <Section title={copy.payments} hint={copy.paymentsHint} icon={Chart2} tone="sky">
          {data.payments ? (
            <>
              <p className={styles.muted}>{copy.paymentsTotal}</p>
              <p className={styles.amount}>
                <bdi>{studentMoney(data.payments.total, locale)}</bdi>
              </p>
              {data.payments.months.some((m) => Number(m.amount) > 0) ? (
                <div className={styles.chart}>
                  <PaymentsChart payments={data.payments} locale={locale} />
                </div>
              ) : (
                <Empty title={copy.paymentsEmpty} />
              )}
              <dl className="sr-only">
                {data.payments.months.map((m) => (
                  <div key={m.month}>
                    <dt>
                      {date(`${m.month}-01T12:00:00Z`, locale, { month: 'long', year: 'numeric' })}
                    </dt>
                    <dd>{studentMoney(m.amount, locale)}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <Empty title={copy.unavailable} />
          )}
        </Section>
      </div>
      <div className={styles.grid}>
        <Section title={copy.installments} icon={Receipt} tone="orange">
          {!data.finance ? (
            <Empty title={copy.unavailable} />
          ) : data.finance.installments.items.length ? (
            <>
              <ul className={styles.rows}>
                {data.finance.installments.items.map((item) => (
                  <li className={styles.row} key={item.id}>
                    <div>
                      <h3>
                        {copy.installment.replace('{number}', formatCount(item.ordinal, locale))}
                      </h3>
                      <p className={styles.muted}>
                        <bdi>{item.course ?? copy.course}</bdi>
                      </p>
                      <time className={styles.muted} dateTime={item.dueDate}>
                        {date(`${item.dueDate}T12:00:00Z`, locale, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </time>
                    </div>
                    <div className={styles.rowEnd}>
                      <Status state={item.state} copy={copy} />
                      <span>
                        <bdi>{studentMoney(item.remaining, locale)}</bdi>{' '}
                        <span className={styles.muted}>{copy.remaining}</span>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              {data.finance.installments.total > 6 ? (
                <p className={`${styles.muted} ${styles.note}`}>
                  {formatCount(data.finance.installments.items.length, locale)} /{' '}
                  {formatCount(data.finance.installments.total, locale)}
                </p>
              ) : null}
            </>
          ) : (
            <Empty title={copy.noInstallments} />
          )}
        </Section>
        <Section title={copy.courses} hint={copy.coursesHint} icon={Book1} tone="purple">
          {data.courses.items.length ? (
            <ul className={styles.rows}>
              {data.courses.items.map((course) => (
                <li key={course.id} className={styles.row}>
                  <div className={styles.rowMain}>
                    <DashboardIconTile tone="purple">
                      <Book1 color="currentColor" size={20} variant="Bulk" />
                    </DashboardIconTile>
                    <h3>
                      <ButtonLink
                        variant="ghost"
                        className="h-auto whitespace-normal text-start"
                        href={`/${locale}/learning?record=${encodeURIComponent(course.id)}`}
                      >
                        <bdi>{course.name ?? copy.course}</bdi>
                      </ButtonLink>
                    </h3>
                  </div>
                  <Status state={course.state} copy={copy} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty title={copy.coursesEmpty} />
          )}
          {data.courses.total > 6 ? (
            <p className={`${styles.muted} ${styles.note}`}>
              {formatCount(data.courses.items.length, locale)} /{' '}
              {formatCount(data.courses.total, locale)}
            </p>
          ) : null}
        </Section>
      </div>
    </div>
  );
}

export { studentDayKey, studentWeekDays } from './student-overview-parts';
