'use client';

import { ResponsiveBar } from '@nivo/bar';
import { ResponsiveLine } from '@nivo/line';
import { ResponsivePie } from '@nivo/pie';
import { useCallback, useState } from 'react';
import type { Locale } from '@/lib/locales';
import { AccessibleBarItem } from './accessible-bar-item';
import { localeTag } from './formatters';

export type ChartSeries = { id: string; label: string; color: string };
export type StaffChartProps = {
  title: string;
  data: Array<{ label: string; [key: string]: string | number }>;
  series: ChartSeries[];
  locale: Locale;
  unit?: 'count' | 'money' | 'hours';
  barStyle?: 'default' | 'rounded';
};
const theme = {
  text: { fill: 'var(--sales-muted)', fontSize: 11 },
  fontFamily: 'inherit',
  axis: { ticks: { text: { fill: 'var(--sales-muted)', fontSize: 11 } } },
  grid: { line: { stroke: 'var(--sales-border)', strokeDasharray: '3 4' } },
  tooltip: {
    container: {
      background: 'var(--sales-surface)',
      color: 'var(--sales-primary)',
      border: '1px solid var(--sales-border)',
      borderRadius: 10,
      fontSize: 12,
    },
  },
};
const roundedBarTheme = {
  ...theme,
  text: { ...theme.text, fontSize: 12 },
  axis: { ticks: { text: { fill: 'var(--sales-muted)', fontSize: 12 } } },
  grid: { line: { stroke: 'var(--sales-border)', strokeDasharray: '4 6', strokeOpacity: 0.65 } },
  tooltip: {
    container: { ...theme.tooltip.container, borderRadius: 14, fontSize: 13 },
  },
};
const number = (locale: Locale, unit: StaffChartProps['unit'], compact = false) =>
  new Intl.NumberFormat(localeTag(locale), {
    ...(unit === 'money' && !compact ? { style: 'currency', currency: 'EGP' } : {}),
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: unit === 'money' ? 2 : unit === 'hours' ? 1 : 0,
    ...(unit === 'money' && !compact ? { minimumFractionDigits: 2 } : {}),
  });

export function StaffBarChart({
  title,
  data,
  series,
  locale,
  unit = 'count',
  barStyle = 'default',
}: StaffChartProps) {
  const rounded = barStyle === 'rounded';
  const rtl = locale === 'ar';
  const displayedData = rtl ? data.toReversed() : data;
  const [compact, setCompact] = useState(true);
  const onResize = useCallback(({ width }: { width: number }) => setCompact(width < 480), []);
  const format = number(locale, unit);
  const axisFormat = number(locale, unit, unit === 'money');
  const chartTheme = rounded ? roundedBarTheme : theme;
  const max = Math.max(
    0,
    ...data.map((row) => series.reduce((sum, s) => sum + Number(row[s.id] ?? 0), 0)),
  );
  const valueTicks =
    unit === 'count' && max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : 4;
  const dateTicks = displayedData
    .filter((_, i) => i === 0 || i === Math.floor(data.length / 2) || i === data.length - 1)
    .map((d) => d.label);
  const valueAxis = {
    tickSize: 0,
    tickPadding: 8,
    tickValues: valueTicks,
    format: (v: string | number) => axisFormat.format(Number(v)),
  };
  const valueMargin = unit === 'money' ? 58 : 42;
  return (
    <div className="h-full" dir="ltr">
      <ResponsiveBar
        barComponent={AccessibleBarItem}
        data={displayedData}
        keys={series.map((s) => s.id)}
        indexBy="label"
        colors={({ id }) => series.find((s) => s.id === id)?.color ?? '#3b82f6'}
        padding={rounded ? 0.46 : 0.4}
        innerPadding={2}
        borderRadius={rounded ? 10 : 4}
        enableLabel={false}
        valueScale={{
          type: 'linear',
          min: 0,
          ...(rounded ? { max: Math.max(1, max * 1.12), nice: 4 } : {}),
        }}
        enableGridX={false}
        {...(rounded ? { gridYValues: valueTicks, onResize } : {})}
        margin={{
          top: rounded ? 18 : 12,
          right: rtl ? valueMargin : 12,
          bottom: 40,
          left: rtl ? 12 : valueMargin,
        }}
        axisBottom={{
          tickSize: 0,
          tickPadding: 12,
          ...(unit === 'money'
            ? {
                tickValues: rounded && !compact ? displayedData.map((d) => d.label) : dateTicks,
              }
            : {}),
        }}
        axisLeft={rtl ? null : valueAxis}
        axisRight={rtl ? valueAxis : null}
        theme={chartTheme}
        animate={false}
        role="img"
        ariaLabel={title}
        isFocusable
        valueFormat={(v) => format.format(v)}
        barAriaLabel={(bar) =>
          `${bar.indexValue}, ${series.find((s) => s.id === bar.id)?.label}: ${format.format(bar.value ?? 0)}`
        }
        tooltip={({ id, value, indexValue, color }) => (
          <div
            dir={rtl ? 'rtl' : 'ltr'}
            style={{
              ...chartTheme.tooltip.container,
              padding: rounded ? '12px 14px' : '10px 12px',
            }}
          >
            <strong style={{ color }}>{indexValue}</strong>
            <br />
            {series.find((s) => s.id === id)?.label}: {format.format(value)}
          </div>
        )}
      />
    </div>
  );
}

export function StaffLineChart({ title, data, series, locale, unit = 'count' }: StaffChartProps) {
  const rtl = locale === 'ar';
  const displayedData = rtl ? data.toReversed() : data;
  const ticks = displayedData
    .filter((_, i) => i === 0 || i === data.length - 1 || i % 7 === 0)
    .map((d) => d.label);
  const max = Math.max(0, ...data.flatMap((d) => series.map((s) => Number(d[s.id] ?? 0))));
  const format = number(locale, unit);
  const valueAxis = {
    tickSize: 0,
    tickPadding: 8,
    tickValues: max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : 4,
    format: (v: string | number) => format.format(Number(v)),
  };
  return (
    <div className="h-full" dir="ltr">
      <ResponsiveLine
        data={series.map((s) => ({
          id: s.label,
          data: displayedData.map((d) => ({ x: d.label, y: Number(d[s.id] ?? 0) })),
        }))}
        colors={series.map((s) => s.color)}
        margin={{ top: 14, right: rtl ? 38 : 20, bottom: 40, left: rtl ? 20 : 38 }}
        xScale={{ type: 'point' }}
        yScale={{ type: 'linear', min: 0, max: 'auto', stacked: false }}
        axisBottom={{ tickValues: ticks, tickSize: 0, tickPadding: 12 }}
        axisLeft={rtl ? null : valueAxis}
        axisRight={rtl ? valueAxis : null}
        curve="linear"
        lineWidth={2.5}
        enableGridX={false}
        enablePoints={false}
        enableArea={false}
        useMesh
        enableCrosshair={false}
        theme={theme}
        animate={false}
        role="img"
        ariaLabel={title}
        isFocusable
        yFormat={(v) => format.format(Number(v))}
      />
    </div>
  );
}

export function StaffDonutChart({
  title,
  data,
  locale,
}: {
  title: string;
  data: Array<{ id: string; value: number; color: string }>;
  locale: Locale;
}) {
  const displayedData = locale === 'ar' ? data.toReversed() : data;
  return (
    <div className="relative h-full" dir="ltr" role="img" aria-label={title}>
      <ResponsivePie
        role="presentation"
        data={displayedData.filter((d) => d.value > 0)}
        colors={{ datum: 'data.color' }}
        innerRadius={0.78}
        padAngle={2}
        cornerRadius={4}
        margin={{ top: 10, bottom: 10, left: 10, right: 10 }}
        enableArcLabels={false}
        enableArcLinkLabels={false}
        theme={theme}
        animate={false}
        valueFormat={(v) => number(locale, 'count').format(Number(v))}
      />
      <span className="pointer-events-none absolute inset-0 grid place-items-center text-3xl font-semibold tabular-nums">
        {number(locale, 'count').format(data.reduce((sum, d) => sum + d.value, 0))}
      </span>
    </div>
  );
}
