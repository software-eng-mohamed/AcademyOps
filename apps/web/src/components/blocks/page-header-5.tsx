'use client';

// 7Ovr Page Header 5 (MIT-0): https://7ovr.com/r/page-header-5.json
// Demo text/state become props; theme tokens, Iconsax and logical RTL alignment only.
import { cn } from '@academyops/ui';
import { Button, Input } from '@academyops/ui/registry';
import { Add, Element3, RowHorizontal, SearchNormal1 } from 'iconsax-react';
import type { ReactNode } from 'react';
import { saveViewPreference } from '@/features/dashboard/view-preference';

export function PageHeader5({
  title,
  description,
  action,
  toolbar,
  filters,
  search,
  view,
  onViewChange,
  labels,
}: {
  title: string;
  description: string;
  action?: { label: string; disabled: boolean; onClick: () => void };
  toolbar?: ReactNode;
  filters?: ReactNode;
  search?: {
    value: string;
    placeholder: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
  };
  view: 'table' | 'grid';
  onViewChange: (view: 'table' | 'grid') => void;
  labels: { search: string; table: string; grid: string; display: string };
}) {
  return (
    <header className="w-full text-ink" data-library-block="7ovr/page-header-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-ink-muted">{description}</p>
        </div>
        {action ? (
          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={action.disabled}
            onClick={action.onClick}
          >
            <Add color="currentColor" aria-hidden className="size-4" />
            {action.label}
          </Button>
        ) : null}
      </div>
      <div className="my-5 h-px bg-border" />
      {toolbar}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {search ? (
          <form
            className="relative w-full lg:max-w-xs"
            onSubmit={(event) => {
              event.preventDefault();
              search.onSubmit();
            }}
          >
            <SearchNormal1
              color="currentColor"
              className="pointer-events-none absolute top-1/2 start-2.5 size-4 -translate-y-1/2 text-ink-muted"
              aria-hidden
            />
            <Input
              type="search"
              value={search.value}
              onChange={(event) => search.onChange(event.target.value)}
              placeholder={search.placeholder}
              className="ps-8 pe-10"
              aria-label={labels.search}
            />
            <Button
              type="submit"
              variant="ghost"
              size="icon-sm"
              className="absolute end-0.5 top-0.5"
              aria-label={labels.search}
            >
              <RowHorizontal color="currentColor" aria-hidden className="size-3.5" />
            </Button>
          </form>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {filters}
          <fieldset
            className="flex overflow-hidden rounded-lg border border-border"
            aria-label={labels.display}
          >
            {(['table', 'grid'] as const).map((mode) => {
              const Icon = mode === 'table' ? RowHorizontal : Element3;
              return (
                <button
                  key={mode}
                  type="button"
                  aria-label={labels[mode]}
                  aria-pressed={view === mode}
                  onClick={() => {
                    saveViewPreference(mode);
                    onViewChange(mode);
                  }}
                  className={cn(
                    'flex size-8 items-center justify-center transition-colors',
                    mode === 'grid' && 'border-s border-border',
                    view === mode
                      ? 'bg-brand text-primary-foreground'
                      : 'text-ink-muted hover:bg-surface-subtle/60',
                  )}
                >
                  <Icon color="currentColor" className="size-4" aria-hidden />
                </button>
              );
            })}
          </fieldset>
        </div>
      </div>
    </header>
  );
}
