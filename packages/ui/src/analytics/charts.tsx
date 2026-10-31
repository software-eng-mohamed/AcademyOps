'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  Cell,
  Line,
  BarChart as RechartsBarChart,
  LineChart as RechartsLineChart,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '../lib/cn';

export type ChartPoint = {
  key: string;
  label: string;
  longLabel: string;
  previousValue?: number | null;
  value: number;
};

type ChartCommonProps = {
  ariaLabel: string;
  axisFormatter?: (value: number) => string;
  className?: string;
  points: ChartPoint[];
  valueFormatter?: (value: number) => string;
};

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

export function ChartTooltip({
  currentLabel = 'Current period',
  label,
  previousLabel = 'Previous period',
  previousValue,
  value,
  valueFormatter = String,
}: {
  currentLabel?: string;
  label: string;
  previousLabel?: string;
  previousValue?: number | null;
  value: number;
  valueFormatter?: (value: number) => string;
}) {
  const delta =
    previousValue && previousValue !== 0 ? ((value - previousValue) / previousValue) * 100 : null;
  return (
    <div className="min-w-40 rounded-sm border border-border bg-surface px-3 py-2.5 text-[11px] shadow-[var(--plg-shadow-popover)]">
      <p className="font-semibold text-ink">{label}</p>
      <dl className="mt-2 grid gap-1.5">
        <div className="flex items-center justify-between gap-5">
          <dt className="text-ink-muted">{currentLabel}</dt>
          <dd className="font-mono font-semibold text-ink">{valueFormatter(value)}</dd>
        </div>
        {previousValue !== null && previousValue !== undefined ? (
          <div className="flex items-center justify-between gap-5">
            <dt className="text-ink-muted">{previousLabel}</dt>
            <dd className="font-mono text-ink">{valueFormatter(previousValue)}</dd>
          </div>
        ) : null}
      </dl>
      {delta !== null ? (
        <p
          className={cn(
            'mt-2 border-t border-border pt-2 font-mono font-semibold',
            delta >= 0 ? 'text-success' : 'text-warning',
          )}
        >
          {delta >= 0 ? '+' : ''}
          {Math.round(delta)}%
        </p>
      ) : null}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="grid h-full place-items-center rounded-sm border border-dashed border-border text-xs text-ink-muted">
      No trend data is available.
    </div>
  );
}

function hiddenData(points: ChartPoint[], ariaLabel: string, formatter: (value: number) => string) {
  return (
    <div className="sr-only">
      <p>{ariaLabel} data</p>
      <ul>
        {points.map((point) => (
          <li key={point.key}>
            {point.longLabel}: {formatter(point.value)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LineChart({
  ariaLabel,
  axisFormatter = String,
  className,
  points,
  valueFormatter = String,
}: ChartCommonProps) {
  const reducedMotion = useReducedMotion();
  const hasComparison = useMemo(
    () => points.some((point) => point.previousValue != null),
    [points],
  );
  return (
    <div aria-label={ariaLabel} className={cn('h-36 min-w-0', className)} role="img">
      {points.length ? (
        <>
          <ResponsiveContainer height="100%" width="100%">
            <RechartsLineChart data={points} margin={{ bottom: 0, left: -14, right: 8, top: 6 }}>
              <CartesianGrid
                stroke="var(--plg-color-chart-grid)"
                strokeDasharray="2 4"
                vertical={false}
              />
              <XAxis
                axisLine={false}
                dataKey="label"
                interval={0}
                minTickGap={8}
                tick={{ fill: 'var(--plg-color-ink-muted)', fontSize: 10 }}
                tickLine={false}
                tickMargin={8}
              />
              <YAxis
                axisLine={false}
                tick={{ fill: 'var(--plg-color-ink-muted)', fontSize: 9 }}
                tickFormatter={axisFormatter}
                tickLine={false}
                tickMargin={6}
                width={44}
              />
              <RechartsTooltip
                animationDuration={reducedMotion ? 0 : 120}
                content={({ active, payload }) => {
                  const point = payload?.[0]?.payload as ChartPoint | undefined;
                  return active && point ? (
                    <ChartTooltip
                      label={point.longLabel}
                      {...(point.previousValue !== undefined
                        ? { previousValue: point.previousValue }
                        : {})}
                      value={point.value}
                      valueFormatter={valueFormatter}
                    />
                  ) : null;
                }}
                cursor={{ stroke: 'var(--plg-color-border-strong)', strokeWidth: 1 }}
                isAnimationActive={!reducedMotion}
                wrapperStyle={{ outline: 'none', transition: 'opacity 120ms ease-out' }}
              />
              {hasComparison ? (
                <Line
                  animationDuration={reducedMotion ? 0 : 360}
                  dataKey="previousValue"
                  dot={false}
                  isAnimationActive={!reducedMotion}
                  stroke="var(--plg-color-chart-comparison)"
                  strokeDasharray="4 5"
                  strokeWidth={1.25}
                  type="monotone"
                />
              ) : null}
              <Line
                activeDot={{
                  fill: 'white',
                  r: 3,
                  stroke: 'var(--plg-color-brand)',
                  strokeWidth: 2,
                }}
                animationDuration={reducedMotion ? 0 : 560}
                dataKey="value"
                dot={false}
                isAnimationActive={!reducedMotion}
                stroke="var(--plg-color-brand)"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                type="monotone"
              />
            </RechartsLineChart>
          </ResponsiveContainer>
          {hiddenData(points, ariaLabel, valueFormatter)}
        </>
      ) : (
        <EmptyChart />
      )}
    </div>
  );
}

export function BarChart({
  ariaLabel,
  axisFormatter = String,
  className,
  points,
  valueFormatter = String,
}: ChartCommonProps) {
  const reducedMotion = useReducedMotion();
  const [activeBar, setActiveBar] = useState<number | null>(null);
  const hasComparison = points.some((point) => point.previousValue != null);
  return (
    <div aria-label={ariaLabel} className={cn('h-36 min-w-0', className)} role="img">
      {points.length ? (
        <>
          <ResponsiveContainer height="100%" width="100%">
            <RechartsBarChart
              data={points}
              margin={{ bottom: 0, left: -12, right: 8, top: 6 }}
              onMouseLeave={() => setActiveBar(null)}
            >
              <CartesianGrid
                stroke="var(--plg-color-chart-grid)"
                strokeDasharray="2 4"
                vertical={false}
              />
              <XAxis
                axisLine={false}
                dataKey="label"
                interval={0}
                minTickGap={8}
                tick={{ fill: 'var(--plg-color-ink-muted)', fontSize: 10 }}
                tickLine={false}
                tickMargin={8}
              />
              <YAxis
                axisLine={false}
                tick={{ fill: 'var(--plg-color-ink-muted)', fontSize: 9 }}
                tickFormatter={axisFormatter}
                tickLine={false}
                tickMargin={6}
                width={48}
              />
              <RechartsTooltip
                animationDuration={reducedMotion ? 0 : 120}
                content={({ active, payload }) => {
                  const point = payload?.[0]?.payload as ChartPoint | undefined;
                  return active && point ? (
                    <ChartTooltip
                      currentLabel="Collections"
                      label={point.longLabel}
                      {...(point.previousValue !== undefined
                        ? { previousValue: point.previousValue }
                        : {})}
                      value={point.value}
                      valueFormatter={valueFormatter}
                    />
                  ) : null;
                }}
                cursor={{ fill: 'var(--plg-color-brand)', fillOpacity: 0.025 }}
                isAnimationActive={!reducedMotion}
                wrapperStyle={{ outline: 'none', transition: 'opacity 120ms ease-out' }}
              />
              {hasComparison ? (
                <Bar
                  animationBegin={reducedMotion ? 0 : 25}
                  animationDuration={reducedMotion ? 0 : 440}
                  barSize={12}
                  dataKey="previousValue"
                  fill="var(--plg-color-chart-comparison)"
                  isAnimationActive={!reducedMotion}
                  radius={[4, 4, 1, 1]}
                />
              ) : null}
              <Bar
                animationBegin={reducedMotion ? 0 : 30}
                animationDuration={reducedMotion ? 0 : 480}
                barSize={14}
                dataKey="value"
                fill="var(--plg-color-brand)"
                isAnimationActive={!reducedMotion}
                onMouseEnter={(_, index) => setActiveBar(index)}
                radius={[4, 4, 1, 1]}
              >
                {points.map((point, index) => (
                  <Cell
                    fillOpacity={activeBar === null || activeBar === index ? 0.94 : 0.42}
                    key={point.key}
                    style={{ transition: 'fill-opacity 120ms ease-out' }}
                  />
                ))}
              </Bar>
            </RechartsBarChart>
          </ResponsiveContainer>
          {hiddenData(points, ariaLabel, valueFormatter)}
        </>
      ) : (
        <EmptyChart />
      )}
    </div>
  );
}

export type HealthSegment = {
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
  value: number;
};

export function HealthDistribution({ segments }: { segments: HealthSegment[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const tones = {
    danger: 'bg-danger',
    neutral: 'bg-border-strong',
    success: 'bg-success',
    warning: 'bg-accent',
  } as const;
  return (
    <div>
      <div
        className="flex h-2 overflow-hidden rounded-full bg-surface-subtle"
        role="img"
        aria-label={segments.map((segment) => `${segment.value} ${segment.label}`).join(', ')}
      >
        {segments.map((segment) => (
          <span
            className={tones[segment.tone]}
            key={segment.label}
            style={{ width: total ? `${(segment.value / total) * 100}%` : '0%' }}
          />
        ))}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {segments.map((segment) => (
          <div key={segment.label}>
            <dt className="flex items-center gap-1.5 text-[10px] text-ink-muted">
              <span className={cn('size-1.5 rounded-full', tones[segment.tone])} />
              {segment.label}
            </dt>
            <dd className="mt-0.5 font-mono text-xs font-semibold text-ink">
              {segment.value.toLocaleString('en-US')}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ChartSkeleton({ className }: { className?: string }) {
  const bars = [
    { height: 38, id: 'one' },
    { height: 62, id: 'two' },
    { height: 48, id: 'three' },
    { height: 75, id: 'four' },
    { height: 58, id: 'five' },
    { height: 84, id: 'six' },
  ];
  return (
    <div
      aria-label="Loading chart"
      className={cn(
        'h-36 animate-pulse rounded-sm border border-border bg-surface p-3 motion-reduce:animate-none',
        className,
      )}
      role="status"
    >
      <div className="flex h-full items-end gap-2 border-b border-l border-border px-3 pb-2">
        {bars.map(({ height, id }) => (
          <span
            className="flex-1 rounded-t-sm bg-surface-subtle"
            key={id}
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export function ChartLegend({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-4 text-[10px] text-ink-muted">{children}</div>;
}
