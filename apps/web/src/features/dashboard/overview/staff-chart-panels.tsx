'use client';

import type { OverviewCount } from '@academyops/api-client/workspace-overview';

import dynamic from 'next/dynamic';

import { getStaffOverviewCopy } from '@/i18n/staff-overview-copy';

import type { Locale } from '@/lib/locales';
import { formatCount, localeTag } from './formatters';
import type { ChartSeries, StaffChartProps } from './staff-overview-charts';
import styles from './staff-overview-styles';
import { Empty, staffMoney, statusColors } from './staff-overview-ui';

const Bars = dynamic(() => import('./staff-overview-charts').then((m) => m.StaffBarChart), {
  ssr: false,
});

const Line = dynamic(() => import('./staff-overview-charts').then((m) => m.StaffLineChart), {
  ssr: false,
});

const Donut = dynamic(() => import('./staff-overview-charts').then((m) => m.StaffDonutChart), {
  ssr: false,
});

export function SeriesChart(props: StaffChartProps & { kind?: 'bar' | 'line' }) {
  const { series, data, locale, title, kind = 'bar' } = props;
  if (!data.some((d) => series.some((s) => Number(d[s.id]) > 0))) return <Empty locale={locale} />;
  return (
    <>
      <div className={styles.chart}>
        {kind === 'line' ? <Line {...props} /> : <Bars {...props} />}
      </div>
      {series.length > 1 ? (
        <div className={styles.legend}>
          {series.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5">
              <i
                aria-hidden
                className="inline-block size-2 shrink-0 rounded-xs"
                style={{ background: s.color }}
              />
              {s.label}
            </span>
          ))}
        </div>
      ) : null}
      <dl className="sr-only" aria-label={title}>
        {data.map((d) => (
          <div key={d.label}>
            <dt>{d.label}</dt>
            {series.map((s) => (
              <dd key={s.id}>
                {s.label}:{' '}
                {props.unit === 'money'
                  ? staffMoney(d[s.id] ?? 0, locale)
                  : new Intl.NumberFormat(localeTag(locale), { maximumFractionDigits: 1 }).format(
                      Number(d[s.id] ?? 0),
                    )}
              </dd>
            ))}
          </div>
        ))}
      </dl>
    </>
  );
}

export function StateDonut({
  data,
  locale,
  title,
}: {
  data: OverviewCount[];
  locale: Locale;
  title: string;
}) {
  const copy = getStaffOverviewCopy(locale);
  const chart = data.map((d) => ({
    id: copy.states[d.key] ?? copy.unknown,
    value: d.value,
    color: statusColors[d.key] ?? '#94a3b8',
  }));
  return data.some((d) => d.value > 0) ? (
    <>
      <div className={styles.donut}>
        <Donut title={title} data={chart} locale={locale} />
      </div>
      <div className={styles.legend}>
        {chart.map((d) => (
          <span key={d.id}>
            <i aria-hidden style={{ background: d.color }} />
            {d.id}: {formatCount(d.value, locale)}
          </span>
        ))}
      </div>
    </>
  ) : (
    <Empty locale={locale} />
  );
}

export function RankedValues({
  items,
  locale,
  money = false,
}: {
  items: Array<{ key: string; label: string; value: number; color?: string }>;
  locale: Locale;
  money?: boolean;
}) {
  const max = Math.max(0, ...items.map((d) => d.value));
  if (!max) return <Empty locale={locale} />;
  return (
    <ul className={styles.ranking}>
      {items.map((d) => (
        <li key={d.key}>
          <div className={styles.rankLabel}>
            <bdi>{d.label}</bdi>
            <strong>
              <bdi>{money ? staffMoney(d.value, locale) : formatCount(d.value, locale)}</bdi>
            </strong>
          </div>
          <div className={styles.track} aria-hidden>
            <span
              className="block h-full rounded-full"
              style={{ width: `${(d.value / max) * 100}%`, background: d.color ?? '#3b82f6' }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function StateRanking({ items, locale }: { items: OverviewCount[]; locale: Locale }) {
  const copy = getStaffOverviewCopy(locale);
  return (
    <RankedValues
      locale={locale}
      items={items.map((d) => ({
        key: d.key,
        label: copy.states[d.key] ?? copy.unknown,
        value: d.value,
        color: statusColors[d.key] ?? '#94a3b8',
      }))}
    />
  );
}

export const series = (id: string, label: string, color = '#3b82f6'): ChartSeries => ({
  id,
  label,
  color,
});
