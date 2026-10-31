import type { ReactNode } from 'react';
import { cn } from './lib/cn';

export type MetricDelta = {
  direction: 'up' | 'down' | 'flat';
  sentiment: 'positive' | 'negative' | 'neutral' | 'warning';
  label: string;
};

export type MetricTrend = {
  label: string;
  tone?: 'brand' | 'positive' | 'negative' | 'warning' | 'neutral';
  values: readonly number[];
};

export type MetricCardProps = {
  delta?: MetricDelta;
  density?: 'default' | 'compact';
  format?: 'count' | 'currency' | 'percentage' | 'ratio' | 'duration';
  icon?: ReactNode;
  iconTone?: 'brand' | 'blue' | 'emerald' | 'orange' | 'violet';
  interactive?: boolean;
  label: string;
  state?: 'default' | 'loading' | 'error' | 'no-data';
  supportingText?: ReactNode;
  trend?: MetricTrend;
  value: ReactNode;
};

const sentimentClass = {
  negative: 'bg-danger-soft text-danger',
  neutral: 'bg-surface-subtle text-ink-muted',
  positive: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
};

const trendToneClass = {
  brand: 'text-brand',
  negative: 'text-danger',
  neutral: 'text-ink-muted',
  positive: 'text-success',
  warning: 'text-warning',
};

const iconToneClass = {
  blue: 'bg-blue-50 text-blue-600 ring-blue-100 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/20',
  brand: 'bg-brand-soft text-brand ring-brand/10',
  emerald:
    'bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/20',
  orange:
    'bg-orange-50 text-orange-600 ring-orange-100 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-500/20',
  violet:
    'bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/20',
};

function sparklinePaths(values: readonly number[]) {
  const points = values.filter(Number.isFinite);
  if (points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min;
  const coordinates = points.map((point, index) => {
    const x = (index / (points.length - 1)) * 100;
    const y = range === 0 ? 15 : 3 + ((max - point) / range) * 24;
    return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };
  });
  const line = coordinates.map(({ x, y }, index) => `${index ? 'L' : 'M'} ${x} ${y}`).join(' ');
  const areaLine = coordinates.map(({ x, y }) => `L ${x} ${y}`).join(' ');
  const last = coordinates.at(-1);

  return {
    area: `M 0 30 ${areaLine} L 100 30 Z`,
    last,
    line,
  };
}

function MetricSparkline({ trend }: { trend: MetricTrend }) {
  const paths = sparklinePaths(trend.values);
  if (!paths) return null;

  return (
    <div
      aria-label={trend.label}
      className={cn('mt-auto pt-2', trendToneClass[trend.tone || 'brand'])}
      role="img"
    >
      <p className="mb-0.5 text-[10px] font-medium text-ink-muted">{trend.label}</p>
      <svg
        aria-hidden="true"
        className="h-10 w-full overflow-visible"
        focusable="false"
        preserveAspectRatio="none"
        viewBox="0 0 100 30"
      >
        <path d={paths.area} fill="currentColor" opacity="0.09" />
        <path
          d={paths.line}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.75"
          vectorEffect="non-scaling-stroke"
        />
        {paths.last ? (
          <circle
            cx={paths.last.x}
            cy={paths.last.y}
            fill="currentColor"
            r="1.8"
            stroke="white"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>
    </div>
  );
}

export function MetricCard({
  delta,
  density = 'default',
  format = 'count',
  icon,
  iconTone = 'brand',
  interactive = false,
  label,
  state = 'default',
  supportingText,
  trend,
  value,
}: MetricCardProps) {
  const showTrend = state === 'default' && trend && trend.values.length > 1;

  return (
    <article
      aria-busy={state === 'loading'}
      className={cn(
        'relative flex flex-col overflow-hidden border bg-surface shadow-card',
        density === 'compact'
          ? 'min-h-24 justify-center rounded-xl border-border px-4 py-3.5'
          : 'min-h-[176px] rounded-[20px] border-border px-5 py-5 sm:px-6',
        interactive &&
          density === 'compact' &&
          'transition-colors duration-150 hover:border-brand/20',
        interactive &&
          density === 'default' &&
          'transition-[border-color,box-shadow,transform] duration-150 ease-out hover:-translate-y-px hover:border-border-strong hover:shadow-raised motion-reduce:transform-none motion-reduce:transition-none',
      )}
      data-density={density}
      data-format={format}
      data-state={state}
    >
      <div className="flex items-start justify-between gap-3">
        <p
          className={cn(
            'font-medium text-ink-muted',
            density === 'compact' ? 'text-xs leading-4' : 'pt-0.5 text-[12.5px]',
          )}
        >
          {label}
        </p>
        {icon ? (
          <span
            className={cn(
              'grid shrink-0 place-items-center ring-1 ring-inset shadow-sm',
              density === 'compact' ? 'size-8 rounded-[10px]' : 'size-11 rounded-[14px]',
              iconToneClass[iconTone],
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>
      {state === 'loading' ? (
        <div
          className={cn(
            'plg-skeleton h-7 w-24 rounded-[8px]',
            density === 'compact' ? 'mt-1.5' : 'mt-4',
          )}
        />
      ) : (
        <p
          className={cn(
            'plg-tabular plg-value-enter truncate font-semibold tracking-[-0.035em] text-ink',
            density === 'compact'
              ? 'mt-1 text-[24px] leading-7'
              : 'mt-5 text-[2.15rem] leading-none tracking-[-0.045em]',
          )}
        >
          {state === 'error' || state === 'no-data' ? '—' : value}
        </p>
      )}
      {delta && state === 'default' ? (
        <p
          className={cn(
            'flex items-center gap-1.5 text-[11px] text-ink-muted',
            density === 'compact' ? 'mt-1' : 'mt-auto border-t border-border pt-3.5',
          )}
        >
          <span
            className={cn('rounded px-1.5 py-0.5 font-semibold', sentimentClass[delta.sentiment])}
          >
            {delta.direction === 'up' ? '↑' : delta.direction === 'down' ? '↓' : '–'}
          </span>
          {delta.label}
        </p>
      ) : null}
      {showTrend ? <MetricSparkline trend={trend} /> : null}
      {!showTrend && supportingText && state === 'default' ? (
        <p
          className={cn(
            'font-medium text-ink-muted',
            density === 'compact'
              ? 'mt-1 text-[11px] leading-4'
              : 'mt-auto border-t border-border pt-3.5 text-[11px]',
          )}
        >
          {supportingText}
        </p>
      ) : null}
    </article>
  );
}
