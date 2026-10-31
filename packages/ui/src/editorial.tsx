import type { ComponentProps, ReactNode } from 'react';
import { cn } from './lib/cn';

export function PageCanvas({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'plg-page-enter mx-auto w-full max-w-[96rem] space-y-5 px-4 pb-12 pt-5 sm:px-6 lg:px-8 lg:pt-6',
        className,
      )}
      data-slot="page-canvas"
      {...props}
    />
  );
}

export function SectionSurface({
  className,
  tone = 'plain',
  ...props
}: ComponentProps<'section'> & { tone?: 'plain' | 'outlined' | 'tinted' }) {
  return (
    <section
      className={cn(
        'min-w-0 rounded-[var(--plg-radius-section)]',
        tone === 'plain' && 'bg-transparent',
        tone === 'outlined' && 'border border-border bg-surface',
        tone === 'tinted' && 'bg-surface-subtle',
        className,
      )}
      data-slot="section-surface"
      data-tone={tone}
      {...props}
    />
  );
}

export function DataPanel({
  className,
  density = 'default',
  ...props
}: ComponentProps<'div'> & { density?: 'compact' | 'default' | 'relaxed' }) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-[var(--plg-radius-panel)] border border-border bg-surface',
        density === 'compact' && 'p-3.5',
        density === 'default' && 'p-4 sm:p-5',
        density === 'relaxed' && 'p-5 sm:p-6 lg:p-7',
        className,
      )}
      data-density={density}
      data-slot="data-panel"
      {...props}
    />
  );
}

const statusTone = {
  danger: 'border-danger/15 bg-danger-soft text-danger',
  info: 'border-brand/12 bg-brand-soft text-brand-strong',
  neutral: 'border-border bg-surface-subtle text-ink-muted',
  success: 'border-success/15 bg-success-soft text-success',
  warning: 'border-warning/15 bg-warning-soft text-warning',
} as const;

export function InlineStatus({
  children,
  className,
  dot = true,
  tone = 'neutral',
  ...props
}: ComponentProps<'span'> & {
  dot?: boolean;
  tone?: keyof typeof statusTone;
}) {
  return (
    <span
      className={cn(
        'inline-flex min-h-6 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold',
        statusTone[tone],
        className,
      )}
      data-slot="inline-status"
      {...props}
    >
      {dot ? (
        <span aria-hidden="true" className="size-1.5 rounded-full bg-current opacity-80" />
      ) : null}
      {children}
    </span>
  );
}

export function QuickPreview({
  action,
  children,
  className,
  description,
  eyebrow,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
}) {
  return (
    <aside
      className={cn(
        'overflow-hidden rounded-[var(--plg-radius-panel)] border border-border bg-surface',
        className,
      )}
      data-slot="quick-preview"
    >
      <header className="border-b border-border px-4 py-4">
        {eyebrow ? (
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            {eyebrow}
          </div>
        ) : null}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold tracking-[-0.015em] text-ink">
              {title}
            </h2>
            {description ? (
              <div className="mt-1 text-[11px] text-ink-muted">{description}</div>
            ) : null}
          </div>
          {action}
        </div>
      </header>
      <div className="p-4">{children}</div>
    </aside>
  );
}

export type LifecycleStep = {
  description?: ReactNode;
  id: string;
  label: ReactNode;
  state: 'complete' | 'current' | 'upcoming' | 'blocked';
};

export function LifecycleSpine({
  ariaLabel = 'Record lifecycle',
  className,
  steps,
}: {
  ariaLabel?: string;
  className?: string;
  steps: LifecycleStep[];
}) {
  return (
    <ol
      aria-label={ariaLabel}
      className={cn(
        'grid overflow-hidden rounded-[var(--plg-radius-panel)] border border-border bg-surface sm:grid-flow-col sm:auto-cols-fr',
        className,
      )}
      data-slot="lifecycle-spine"
    >
      {steps.map((step, index) => (
        <li
          aria-current={step.state === 'current' ? 'step' : undefined}
          className={cn(
            'relative flex min-w-0 gap-3 border-b border-border px-4 py-3.5 last:border-b-0 sm:border-b-0 sm:border-e sm:last:border-e-0',
            step.state === 'current' && 'bg-brand-soft/70',
          )}
          key={step.id}
        >
          <span
            aria-hidden="true"
            className={cn(
              'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border text-[9px] font-semibold',
              step.state === 'complete' && 'border-brand bg-brand text-primary-foreground',
              step.state === 'current' && 'border-brand bg-surface text-brand ring-3 ring-brand/10',
              step.state === 'upcoming' && 'border-border-strong bg-surface text-ink-muted',
              step.state === 'blocked' && 'border-danger/30 bg-danger-soft text-danger',
            )}
          >
            {step.state === 'complete' ? '✓' : index + 1}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[12px] font-semibold text-ink">{step.label}</span>
            {step.description ? (
              <span className="mt-0.5 block text-[10px] leading-4 text-ink-muted">
                {step.description}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

export type DetailTab = {
  href: string;
  id: string;
  label: ReactNode;
};

export function DetailPageShell({
  actions,
  activeTab,
  aside,
  breadcrumbs,
  children,
  description,
  lifecycle,
  meta,
  status,
  tabs,
  title,
}: {
  actions?: ReactNode;
  activeTab?: string;
  aside?: ReactNode;
  breadcrumbs?: ReactNode;
  children: ReactNode;
  description?: ReactNode;
  lifecycle?: ReactNode;
  meta?: ReactNode;
  status?: ReactNode;
  tabs?: DetailTab[];
  title: ReactNode;
}) {
  return (
    <PageCanvas className="space-y-6">
      <header className="space-y-4">
        {breadcrumbs ? <div className="text-[11px] text-ink-muted">{breadcrumbs}</div> : null}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="truncate text-[clamp(1.65rem,2.3vw,2.15rem)] font-semibold tracking-[-0.045em] text-ink">
                {title}
              </h1>
              {status}
            </div>
            {description ? (
              <div className="mt-1.5 max-w-3xl text-[13px] leading-5 text-ink-muted">
                {description}
              </div>
            ) : null}
            {meta ? <div className="mt-3 text-[11px] text-ink-muted">{meta}</div> : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>
      </header>
      {lifecycle}
      {tabs?.length ? (
        <nav aria-label="Record sections" className="border-b border-border">
          <div className="plg-scrollbar flex gap-6 overflow-x-auto">
            {tabs.map((tab) => (
              <a
                aria-current={activeTab === tab.id ? 'page' : undefined}
                className={cn(
                  'relative flex h-10 shrink-0 items-center text-[12px] font-medium text-ink-muted hover:text-ink',
                  activeTab === tab.id &&
                    'font-semibold text-brand after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand',
                )}
                href={tab.href}
                key={tab.id}
              >
                {tab.label}
              </a>
            ))}
          </div>
        </nav>
      ) : null}
      <div className={cn('grid min-w-0 gap-5', aside && 'xl:grid-cols-[minmax(0,1fr)_20rem]')}>
        <main className="min-w-0">{children}</main>
        {aside ? <aside className="min-w-0 space-y-4">{aside}</aside> : null}
      </div>
    </PageCanvas>
  );
}
