'use client';

import { ResponsiveBar } from '@nivo/bar';
import { ResponsiveLine } from '@nivo/line';
import { ResponsivePie } from '@nivo/pie';
import { CategoryAxisTick } from './category-axis-tick';

const BLUE = '#2f80ff';
const CYAN = '#22d3ee';
const AMBER = '#f59e0b';
const SLATE = '#94a3b8';
const GRID = 'var(--owner-card-grid)';
const INK = 'var(--owner-card-text)';
const MUTED_INK = 'var(--owner-card-muted)';
const PALETTE = [BLUE, CYAN, AMBER, SLATE, '#6366f1'];

const chartTheme = {
  axis: {
    domain: { line: { stroke: GRID, strokeOpacity: 0.42, strokeWidth: 1 } },
    ticks: {
      line: { stroke: 'transparent' },
      text: { fill: MUTED_INK, fontSize: 12 },
    },
  },
  background: 'transparent',
  fontFamily: 'inherit',
  grid: { line: { stroke: GRID, strokeOpacity: 0.2, strokeWidth: 1 } },
  labels: { text: { fill: INK, fontSize: 12 } },
  text: { fill: MUTED_INK, fontSize: 12 },
  tooltip: {
    container: {
      background: 'var(--owner-card-tooltip-bg)',
      border: `1px solid ${GRID}`,
      borderRadius: 12,
      boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
      color: INK,
      fontSize: 12,
    },
  },
};

export type ChartDatum = { color?: string; label: string; value: number };

function integerTickValues(values: number[]): number | number[] {
  const maximum = Math.max(...values, 0);
  if (maximum > 5) return 5;
  return Array.from({ length: maximum + 1 }, (_, index) => index);
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="grid h-full place-items-center text-sm font-medium text-[var(--owner-card-muted)]">
      {label}
    </div>
  );
}

export function SmoothEnrollmentChart({
  ariaLabel,
  data,
  emptyLabel,
  isRtl,
  valueFormatter,
}: {
  ariaLabel: string;
  data: ChartDatum[];
  emptyLabel: string;
  isRtl: boolean;
  valueFormatter: (value: number) => string;
}) {
  if (data.length === 0) return <EmptyChart label={emptyLabel} />;
  const displayedData = isRtl ? data.toReversed() : data;

  return (
    <ResponsiveLine
      animate
      ariaLabel={ariaLabel}
      areaBaselineValue={0}
      areaOpacity={0.1}
      axisBottom={{ tickPadding: 12, tickSize: 0 }}
      axisLeft={{
        format: valueFormatter,
        tickPadding: 10,
        tickSize: 0,
        tickValues: integerTickValues(data.map((item) => item.value)),
      }}
      colors={[BLUE]}
      curve="monotoneX"
      data={[
        {
          data: displayedData.map((item) => ({ x: item.label, y: item.value })),
          id: ariaLabel,
        },
      ]}
      enableArea
      enableCrosshair={false}
      enableGridX={false}
      enablePoints
      lineWidth={3}
      margin={{ bottom: 42, left: 48, right: 18, top: 16 }}
      motionConfig="gentle"
      pointBorderColor={BLUE}
      pointBorderWidth={3}
      pointColor="var(--owner-card-point)"
      pointSize={8}
      role="img"
      theme={chartTheme}
      useMesh
      xScale={{ type: 'point' }}
      yFormat={valueFormatter}
      yScale={{ max: 'auto', min: 0, stacked: false, type: 'linear' }}
    />
  );
}

export function RoundedCollectionsChart({
  ariaLabel,
  data,
  emptyLabel,
  isRtl,
  valueFormatter,
}: {
  ariaLabel: string;
  data: ChartDatum[];
  emptyLabel: string;
  isRtl: boolean;
  valueFormatter: (value: number) => string;
}) {
  if (data.length === 0) return <EmptyChart label={emptyLabel} />;
  const displayedData = isRtl ? data.toReversed() : data;

  return (
    <ResponsiveBar
      animate
      ariaLabel={ariaLabel}
      axisBottom={{ tickPadding: 12, tickSize: 0 }}
      axisLeft={{ format: valueFormatter, tickPadding: 10, tickSize: 0, tickValues: 5 }}
      borderRadius={10}
      colors={[BLUE]}
      data={displayedData}
      enableGridX={false}
      enableLabel={false}
      indexBy="label"
      keys={['value']}
      margin={{ bottom: 42, left: 64, right: 16, top: 16 }}
      motionConfig="gentle"
      padding={0.35}
      role="img"
      theme={chartTheme}
      valueFormat={valueFormatter}
    />
  );
}

export function RoundedDonutChart({
  ariaLabel,
  centerLabel,
  data,
  emptyLabel,
  isRtl,
  valueFormatter,
}: {
  ariaLabel: string;
  centerLabel?: string;
  data: Array<{ name: string; value: number }>;
  emptyLabel: string;
  isRtl: boolean;
  valueFormatter: (value: number) => string;
}) {
  const coloredData = data
    .filter((item) => item.value > 0)
    .map((item, index) => ({
      color: PALETTE[index % PALETTE.length] ?? BLUE,
      id: item.name,
      label: item.name,
      value: item.value,
    }));
  const visibleData = isRtl ? coloredData.toReversed() : coloredData;

  if (visibleData.length === 0) return <EmptyChart label={emptyLabel} />;

  return (
    <div aria-label={ariaLabel} className="grid h-full min-h-0 grid-rows-[1fr_auto]" role="img">
      <div className="relative min-h-0">
        <ResponsivePie
          role="presentation"
          activeOuterRadiusOffset={6}
          animate
          borderWidth={0}
          colors={{ datum: 'data.color' }}
          cornerRadius={8}
          data={visibleData}
          enableArcLabels={false}
          enableArcLinkLabels={false}
          innerRadius={0.68}
          margin={{ bottom: 8, left: 14, right: 14, top: 8 }}
          motionConfig="gentle"
          padAngle={2.5}
          theme={chartTheme}
          valueFormat={valueFormatter}
        />
        {centerLabel ? (
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-xl font-semibold text-[var(--owner-card-text)] tabular-nums">
            {centerLabel}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 px-2 text-xs text-[var(--owner-card-muted)]">
        {visibleData.map((item) => (
          <span className="inline-flex items-center gap-1.5" key={item.id}>
            <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function RoundedHorizontalBars({
  ariaLabel,
  data,
  emptyLabel,
  isRtl,
  showValues = true,
  valueFormatter,
}: {
  ariaLabel: string;
  data: ChartDatum[];
  emptyLabel: string;
  isRtl: boolean;
  showValues?: boolean;
  valueFormatter: (value: number) => string;
}) {
  const coloredData = data.map((item) => ({ ...item, color: item.color ?? BLUE }));
  if (coloredData.length === 0 || coloredData.every((item) => item.value === 0)) {
    return <EmptyChart label={emptyLabel} />;
  }

  return (
    <ResponsiveBar
      animate
      ariaLabel={ariaLabel}
      axisBottom={{
        format: valueFormatter,
        tickPadding: 10,
        tickSize: 0,
        tickValues: integerTickValues(data.map((item) => item.value)),
      }}
      axisLeft={
        isRtl ? null : { renderTick: (tick) => <CategoryAxisTick tick={tick} isRtl={false} /> }
      }
      axisRight={isRtl ? { renderTick: (tick) => <CategoryAxisTick tick={tick} isRtl /> } : null}
      borderRadius={9}
      colors={{ datum: 'data.color' }}
      data={coloredData}
      enableGridY={false}
      enableLabel={showValues}
      indexBy="label"
      keys={['value']}
      labelSkipWidth={28}
      labelTextColor={INK}
      layout="horizontal"
      margin={
        isRtl
          ? { bottom: 38, left: 28, right: 142, top: 10 }
          : { bottom: 38, left: 142, right: 28, top: 10 }
      }
      motionConfig="gentle"
      padding={0.38}
      role="img"
      theme={chartTheme}
      valueScale={{ max: 'auto', min: 0, reverse: isRtl, type: 'linear' }}
      valueFormat={valueFormatter}
    />
  );
}
