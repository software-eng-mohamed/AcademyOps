'use client';

import {
  RiArrowDownCircleFill,
  RiArrowUpCircleFill,
  RiIndeterminateCircleFill,
  RiInformationFill,
} from '@remixicon/react';
import type { ElementType } from 'react';
import { Focusable } from 'react-aria-components';
import { Chip } from '@/components/base/badges/chip';
import { Tooltip, TooltipTrigger } from '@/components/base/tooltip/tooltip';
import { cx } from '@/utils/cx';
import { DashboardIconTile, type DashboardIconTone } from './dashboard-icon-tile';
import { DEFAULT_FOOTER_STATS, DEFAULT_STATS } from './stat-card-defaults';

/**
 * Figma source: Board UI → dashboard 1 → Frame 20 (node 3731:3160) for the
 * plain cards; the footer variant follows the same inner-tile recipe as the
 * recent hires card.
 *
 * KPI stat cards in three looks:
 *
 *   plain   icon tile, label, value, delta chip — the compact dashboard row
 *   footer  tinted gradient icon tile beside the label (plus an optional
 *           info tooltip), a display-size value, and a white footer band
 *           carrying the comparison caption and a delta pill
 *   overview bordered, solid surface with a compact phone layout
 */

type IconComponent = ElementType;

export type StatCardsVariant = 'plain' | 'footer' | 'overview';

/** Tint of the footer variant's gradient icon tile. */
export type StatTone = DashboardIconTone;

export type Stat = {
  icon: IconComponent;
  label: string;
  value: string;
  /** Overview variant: use a smaller, wrapping value for channel states. */
  valueKind?: 'number' | 'status';
  delta?: string;
  deltaColor?: 'lime' | 'rose' | 'neutral';
  /** Footer variant: icon tile tint (defaults to blue). */
  tone?: StatTone;
  /** Footer variant: comparison caption in the band ("From last month"). */
  caption?: string;
  /** Footer variant: shows an info glyph with this text on hover. */
  hint?: string;
};

/** Gradient stops for the footer variant's icon tile, keyed by tone. */
const TILE_TONES: Record<StatTone, string> = {
  blue: 'from-blue-500 to-blue-600',
  orange: 'from-orange-400 to-orange-500',
  purple: 'from-purple-500 to-purple-600',
  pink: 'from-pink-500 to-pink-600',
  sky: 'from-sky-400 to-sky-500',
  emerald: 'from-emerald-500 to-emerald-600',
};

type DeltaColor = NonNullable<Stat['deltaColor']>;

const DELTA_STYLES: Record<DeltaColor, { icon: IconComponent; className: string }> = {
  lime: { icon: RiArrowUpCircleFill, className: 'text-status-lime-text' },
  rose: { icon: RiArrowDownCircleFill, className: 'text-status-rose-text' },
  neutral: { icon: RiIndeterminateCircleFill, className: 'text-text-tertiary' },
};

/** White pill with a direction glyph — the footer band's delta readout. */
function DeltaPill({ delta, deltaColor = 'neutral' }: { delta: string; deltaColor?: DeltaColor }) {
  const { icon: Icon, className } = DELTA_STYLES[deltaColor];
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full border border-border-button-default bg-background-primary-default py-0.5 pr-2 pl-1 shadow-xs">
      <Icon className={cx('size-4 shrink-0', className)} aria-hidden />
      <span className={cx('text-body-medium whitespace-nowrap tabular-nums', className)}>
        {delta}
      </span>
    </span>
  );
}

/** Bare info glyph with a tooltip — the footer header's trailing control. */
function StatHint({ label, hint }: { label: string; hint: string }) {
  return (
    <TooltipTrigger delay={200}>
      <Focusable>
        <button
          type="button"
          aria-label={`About ${label}`}
          className="flex shrink-0 cursor-pointer items-center justify-center rounded-full text-foreground-icon-secondary outline-none transition-colors duration-150 ease hover:text-foreground-icon-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          <RiInformationFill className="size-5" aria-hidden />
        </button>
      </Focusable>
      <Tooltip size="md">{hint}</Tooltip>
    </TooltipTrigger>
  );
}

function PlainStatCard({ stat }: { stat: Stat }) {
  return (
    <section className="flex h-[132px] min-w-0 flex-col items-start justify-between rounded-2xl bg-background-secondary-default p-4">
      <span className="flex items-center rounded-md bg-stat-card-icon-background p-1.5">
        <stat.icon className="size-5 shrink-0 text-foreground-icon-primary" aria-hidden />
      </span>
      <div className="flex w-full flex-col gap-0.5">
        <p className="w-full text-body-medium text-text-secondary">{stat.label}</p>
        <div className="flex w-full flex-wrap items-center gap-2">
          <p className="text-title-1-medium whitespace-nowrap text-text-primary">{stat.value}</p>
          {stat.delta ? (
            <Chip variant="bold" color={stat.deltaColor ?? 'neutral'}>
              {stat.delta}
            </Chip>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function FooterStatCard({ stat }: { stat: Stat }) {
  return (
    <section className="flex min-w-0 flex-col rounded-2xl bg-background-secondary-default p-2">
      {/* Icon tile + optional info glyph */}
      <div className="flex w-full items-center justify-between gap-2.5 p-2">
        <span
          className={cx(
            'flex size-10 shrink-0 items-center justify-center rounded-2lg bg-linear-to-b',
            TILE_TONES[stat.tone ?? 'blue'],
          )}
        >
          <stat.icon className="size-5 shrink-0 text-white" aria-hidden />
        </span>
        {stat.hint && <StatHint label={stat.label} hint={stat.hint} />}
      </div>

      {/* Label sits directly over the number, as on the plain cards */}
      <div className="flex flex-col gap-0.5 px-2 pt-2.5 pb-3.5">
        <p className="truncate text-body-medium text-text-secondary">{stat.label}</p>
        <p className="text-display-4-medium whitespace-nowrap text-text-primary tabular-nums">
          {stat.value}
        </p>
      </div>

      {/* Footer band: comparison caption + delta pill on an inner tile */}
      {stat.caption || stat.delta ? (
        <div className="mt-auto flex w-full items-center justify-between gap-2 rounded-2lg bg-background-inner-default py-1.5 pr-1.5 pl-2.5 shadow-card">
          {stat.caption ? (
            <p className="truncate text-body-regular text-text-secondary">{stat.caption}</p>
          ) : (
            <span />
          )}
          {stat.delta ? (
            <DeltaPill
              delta={stat.delta}
              {...(stat.deltaColor ? { deltaColor: stat.deltaColor } : {})}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** A quieter, solid-color version of the BoardUI tile for welcome overviews. */
function OverviewStatCard({ stat }: { stat: Stat }) {
  const isStatus = stat.valueKind === 'status';
  return (
    <section
      className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] content-center gap-x-3 rounded-[20px] border border-border-secondary bg-background-primary-default p-4.5 shadow-card sm:flex sm:min-h-[180px] sm:flex-col sm:items-start sm:p-5 dark:border-white/10 dark:bg-background-secondary-default"
      data-tone={stat.tone ?? 'blue'}
      data-value-kind={stat.valueKind ?? 'number'}
    >
      <div className={cx('flex min-w-0 items-center gap-3', isStatus ? 'col-span-full' : 'w-full')}>
        <DashboardIconTile tone={stat.tone ?? 'blue'}>
          <stat.icon className="size-5 shrink-0 text-white" aria-hidden />
        </DashboardIconTile>
        <h2 className="text-[14px] font-[550] leading-normal text-text-secondary dark:text-neutral-200">
          {stat.label}
        </h2>
        {stat.hint ? <StatHint label={stat.label} hint={stat.hint} /> : null}
      </div>
      <p
        className={cx(
          'font-semibold tabular-nums text-text-primary [overflow-wrap:anywhere]',
          isStatus
            ? 'col-span-full mt-3.5 text-[22px] leading-snug'
            : 'col-start-2 row-start-1 row-end-3 self-center text-[30px] leading-tight sm:self-start sm:mt-5.5 sm:text-[34px]',
        )}
      >
        {stat.value}
      </p>
      {stat.caption ? (
        <p className="mt-1.5 text-caption-1-regular text-text-tertiary sm:mt-1.5">{stat.caption}</p>
      ) : null}
      {stat.delta ? (
        <Chip className="w-fit" color={stat.deltaColor ?? 'neutral'}>
          {stat.delta}
        </Chip>
      ) : null}
    </section>
  );
}

export function StatCards({
  variant = 'plain',
  stats,
  count,
  columns = 4,
  className,
}: {
  variant?: StatCardsVariant;
  /** KPI cards to render; defaults to demo metrics matching the variant. */
  stats?: Stat[];
  /** How many KPI cards to render (from the start of the list). */
  count?: number;
  /** Columns at the widest breakpoint - 2 keeps the grid two-up for
   *  narrower hosts (docs previews, split layouts), 1 pins a single
   *  column at every width. */
  columns?: 1 | 2 | 4 | 5;
  className?: string;
} = {}) {
  const items = stats ?? (variant === 'footer' ? DEFAULT_FOOTER_STATS : DEFAULT_STATS);
  return (
    <div
      className={cx(
        'grid w-full gap-4',
        // The footer cards carry a display-size value, so they go one per
        // row on phones where the plain cards still fit two up.
        columns === 1
          ? 'grid-cols-1'
          : variant === 'footer'
            ? 'grid-cols-1 sm:grid-cols-2'
            : 'grid-cols-2',
        columns === 4 && (variant === 'footer' ? 'xl:grid-cols-4' : 'lg:grid-cols-4'),
        columns === 5 && (variant === 'footer' ? 'xl:grid-cols-5' : 'lg:grid-cols-5'),
        className,
      )}
    >
      {items
        .slice(0, count ?? items.length)
        .map((stat) =>
          variant === 'overview' ? (
            <OverviewStatCard key={stat.label} stat={stat} />
          ) : variant === 'footer' ? (
            <FooterStatCard key={stat.label} stat={stat} />
          ) : (
            <PlainStatCard key={stat.label} stat={stat} />
          ),
        )}
    </div>
  );
}
