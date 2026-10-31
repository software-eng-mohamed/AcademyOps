'use client';

import { Field } from '@academyops/ui';
import { AnimatedNumber } from '@academyops/ui/academy';
import { Button as SearchButton } from '@academyops/ui/registry';
import {
  Book1,
  Building4,
  Element3,
  Folder2,
  People,
  RowVertical,
  SearchNormal1,
  Teacher,
  UserOctagon,
  UserTick,
} from 'iconsax-react';
import type { ReactNode } from 'react';
import type { AcademyResource, AcademySection } from '@/api/academy/models';
import { Input } from '@/components/base/input/input';
import { Pagination, type PaginationProps } from '@/components/base/pagination/pagination';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@/components/base/segmented-control/segmented-control';
import { saveViewPreference } from '@/features/dashboard/view-preference';
import { type AcademyCopy, academyLabel } from '@/i18n/academy-copy';
import styles from './academy-styles';
import { DirectoryHeading } from './academy-surfaces';

export function AcademyIcon({
  resource,
  className,
}: {
  resource: AcademyResource | AcademySection;
  className?: string;
}) {
  const Icon =
    resource === 'rooms' || resource === 'resources'
      ? Building4
      : resource === 'students'
        ? People
        : resource === 'leads'
          ? UserOctagon
          : resource === 'registrations' || resource === 'enrollments'
            ? UserTick
            : resource === 'programs'
              ? Folder2
              : resource === 'cohorts' || resource === 'trainers'
                ? Teacher
                : Book1;
  return <Icon aria-hidden color="currentColor" variant="Bulk" className={className ?? 'size-5'} />;
}

export function AcademyHeading({
  section,
  resource,
  copy,
  action,
}: {
  section: AcademySection;
  resource: AcademyResource;
  copy: AcademyCopy;
  action?: { disabled: boolean; onClick: () => void };
}) {
  return (
    <DirectoryHeading
      title={academyLabel(copy, section)}
      description={academyLabel(copy, `${section}Description`)}
      icon={<AcademyIcon resource={section} className="size-7" />}
      {...(action ? { action: { ...action, label: academyLabel(copy, `add_${resource}`) } } : {})}
    />
  );
}

export function AcademyToolbar({
  view,
  onViewChange,
  copy,
  search,
  filters,
  showViewSwitch = true,
}: {
  view: 'table' | 'grid';
  onViewChange: (view: 'table' | 'grid') => void;
  copy: AcademyCopy;
  search?: { value: string; onChange: (value: string) => void; onSubmit: () => void };
  filters: ReactNode;
  showViewSwitch?: boolean;
}) {
  return (
    <div className={styles.toolbar}>
      {search ? (
        <form
          className={styles.search}
          onSubmit={(event) => {
            event.preventDefault();
            search.onSubmit();
          }}
        >
          <Field htmlFor="academy-search-input" label={copy.search}>
            <Input
              id="academy-search-input"
              type="search"
              aria-label={copy.search}
              placeholder={copy.searchPlaceholder}
              value={search.value}
              onChange={search.onChange}
              fieldClassName="h-10 rounded-2lg border border-border-button-default bg-background-primary-default shadow-xs hover:border-border-button-hover hover:bg-background-primary-hover focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-border-focus-ring"
              inputClassName="text-body-medium text-text-primary placeholder:text-text-tertiary"
              leadingAddon={
                <SearchNormal1
                  aria-hidden
                  size={18}
                  color="currentColor"
                  className="text-text-secondary"
                />
              }
              trailingAddon={
                <SearchButton
                  type="submit"
                  variant="ghost"
                  size="icon-sm"
                  className="size-6 text-text-tertiary hover:text-text-primary"
                  aria-label={copy.search}
                >
                  <span className="text-text-tertiary font-mono text-xs">↵</span>
                </SearchButton>
              }
            />
          </Field>
        </form>
      ) : null}
      <div className="flex min-w-0 flex-wrap items-end gap-2">{filters}</div>
      {showViewSwitch ? (
        <SegmentedControl
          aria-label={copy.displayMode}
          selectedKeys={new Set([view])}
          onSelectionChange={(keys) => {
            const key = [...keys][0];
            if (key === 'grid' || key === 'table') {
              saveViewPreference(key);
              onViewChange(key);
            }
          }}
          className="ms-auto shrink-0"
        >
          <SegmentedControlItem id="table" aria-label={copy.tableView} className="min-h-8 px-2.5">
            <RowVertical aria-hidden color="currentColor" size={17} />
          </SegmentedControlItem>
          <SegmentedControlItem id="grid" aria-label={copy.gridView} className="min-h-8 px-2.5">
            <Element3 aria-hidden color="currentColor" size={17} />
          </SegmentedControlItem>
        </SegmentedControl>
      ) : null}
    </div>
  );
}

export function AcademyResultCount({ count, label }: { count: number | undefined; label: string }) {
  return (
    <p className="flex items-center gap-2 text-xs text-ink-muted" aria-live="polite">
      <span className="inline-flex min-w-7 justify-center rounded-md border border-border bg-surface px-1.5 py-0.5 font-semibold text-ink">
        {count === undefined ? '—' : <AnimatedNumber value={count} startOnView={false} />}
      </span>
      {label}
    </p>
  );
}

export function AcademyPagination({
  pageLabel,
  ...props
}: PaginationProps & { pageLabel: string }) {
  return (
    <footer className={styles.pagination}>
      <p className="shrink-0 text-xs text-ink-muted">{pageLabel}</p>
      <Pagination {...props} className="max-w-sm" />
    </footer>
  );
}
