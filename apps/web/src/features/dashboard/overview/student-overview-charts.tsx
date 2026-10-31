'use client';

import type { StudentOverview } from '@academyops/api-client/workspace-overview';
import { ResponsiveBar } from '@nivo/bar';
import { ResponsivePie } from '@nivo/pie';
import { getStudentOverviewCopy } from '@/i18n/student-overview-copy';
import type { Locale } from '@/lib/locales';
import { AccessibleBarItem } from './accessible-bar-item';
import { formatCount, localeTag } from './formatters';
import styles from './student-overview-styles';

const theme = {
  text: { fill: 'var(--color-text-secondary, #737373)', fontSize: 12 },
  fontFamily: 'inherit',
  axis: { ticks: { text: { fill: 'var(--color-text-secondary, #737373)', fontSize: 12 } } },
  grid: { line: { stroke: 'var(--color-border-secondary, #e5e5e5)', strokeDasharray: '3 4' } },
  tooltip: {
    container: {
      background: 'var(--color-background-primary-default, #fff)',
      color: 'var(--color-text-primary, #171717)',
      border: '1px solid var(--color-border-secondary, #e5e5e5)',
      borderRadius: 10,
      fontSize: 12,
    },
  },
};
export function StudentAttendanceChart({
  attendance,
  locale,
}: {
  attendance: NonNullable<StudentOverview['attendance']>;
  locale: Locale;
}) {
  const copy = getStudentOverviewCopy(locale);
  const data = [
    { id: copy.attended, value: attendance.numerator, color: '#3b82f6' },
    { id: copy.missed, value: attendance.denominator - attendance.numerator, color: '#f59e0b' },
  ];
  const percent = new Intl.NumberFormat(localeTag(locale), {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(attendance.ratio ?? 0);
  return (
    <div className="grid h-full grid-rows-[1fr_auto]">
      <div
        className="relative min-h-0"
        dir="ltr"
        role="img"
        aria-label={`${copy.attendance}: ${percent}`}
      >
        <ResponsivePie
          data={(locale === 'ar' ? [...data].reverse() : data).filter((d) => d.value > 0)}
          colors={{ datum: 'data.color' }}
          innerRadius={0.78}
          cornerRadius={5}
          padAngle={2}
          margin={{ top: 8, bottom: 10, left: 10, right: 10 }}
          enableArcLabels={false}
          enableArcLinkLabels={false}
          animate={false}
          theme={theme}
          role="presentation"
          valueFormat={(v) => formatCount(Number(v), locale)}
        />
        <span className="pointer-events-none absolute inset-0 grid place-items-center text-3xl font-semibold tabular-nums">
          {percent}
        </span>
      </div>
      <div className={styles.legend}>
        {data.map((d) => (
          <span key={d.id}>
            <i aria-hidden style={{ background: d.color }} />
            {d.id}: {formatCount(d.value, locale)}
          </span>
        ))}
      </div>
    </div>
  );
}
export function StudentPaymentsChart({
  payments,
  locale,
}: {
  payments: NonNullable<StudentOverview['payments']>;
  locale: Locale;
}) {
  const copy = getStudentOverviewCopy(locale);
  const money = (v: number | string) =>
    new Intl.NumberFormat(localeTag(locale), {
      style: 'currency',
      currency: 'EGP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(v));
  const data = payments.months.map((m) => ({
    label: new Intl.DateTimeFormat(localeTag(locale), {
      month: 'short',
      timeZone: 'Africa/Cairo',
    }).format(new Date(`${m.month}-01T12:00:00Z`)),
    amount: Number(m.amount),
  }));
  const valueAxis = {
    tickSize: 0,
    tickPadding: 8,
    tickValues: 4,
    format: (v: string | number) =>
      new Intl.NumberFormat(localeTag(locale), { notation: 'compact' }).format(Number(v)),
  };
  return (
    <div className="h-full" dir="ltr">
      <ResponsiveBar
        barComponent={AccessibleBarItem}
        data={locale === 'ar' ? [...data].reverse() : data}
        keys={['amount']}
        indexBy="label"
        colors={['#3b82f6']}
        borderRadius={5}
        padding={0.5}
        valueScale={{ type: 'linear', min: 0 }}
        margin={{
          top: 12,
          bottom: 40,
          left: locale === 'ar' ? 12 : 55,
          right: locale === 'ar' ? 55 : 12,
        }}
        axisBottom={{ tickSize: 0, tickPadding: 12 }}
        axisLeft={locale === 'ar' ? null : valueAxis}
        axisRight={locale === 'ar' ? valueAxis : null}
        enableLabel={false}
        animate={false}
        theme={theme}
        valueFormat={money}
        role="img"
        ariaLabel={copy.payments}
        isFocusable
        barAriaLabel={(bar) => `${bar.indexValue}: ${money(bar.value ?? 0)}`}
      />
    </div>
  );
}
