'use client';

import { cn } from '@academyops/ui';
import { ArrowDown2 } from 'iconsax-react';
import Link from 'next/link';

import { Disclosure, DisclosurePanel, Button as DisclosureTrigger } from 'react-aria-components';

import type {
  DashboardNavigationGroup,
  DashboardNavigationItem,
  DashboardNavigationKey,
} from '@/features/dashboard/navigation';

import type { Locale } from '@/lib/locales';
import {
  Collapsible,
  isNavigationItemSelected,
  navigationGroupIcons,
  navigationIcons,
  selectedSidebarIconColor,
  sidebarIconColor,
  sidebarIconTertiaryColor,
} from './sidebar-parts';
export function NavigationItem({
  collapsed,
  item,
  label,
  locale,
  onNavigate,
  pathname,
}: {
  collapsed: boolean;
  item: DashboardNavigationItem;
  label: string;
  locale: Locale;
  onNavigate?: () => void;
  pathname: string;
}) {
  const Icon = navigationIcons[item.key];
  const href = `/${locale}/${item.href}`;
  const selected = isNavigationItemSelected(item, locale, pathname);
  const className = cn(
    'group/navigation-item flex min-h-9 items-center justify-between overflow-hidden rounded-2lg p-2 outline-none',
    'transition-[width,background-color,box-shadow,transform] duration-200 ease-out motion-reduce:transform-none motion-reduce:transition-none',
    'hover:scale-[1.012] active:scale-[0.98]',
    collapsed ? 'w-9' : 'w-full',
    selected
      ? 'bg-linear-to-b from-accent-500 to-accent-600 shadow-nav-selected'
      : 'hover:bg-background-secondary-hover focus-visible:bg-background-secondary-hover',
    !item.available && 'cursor-not-allowed',
  );
  const content = (
    <>
      <span className="flex min-w-0 items-center gap-2">
        <Icon
          aria-hidden
          className="shrink-0"
          color={selected ? selectedSidebarIconColor : sidebarIconColor}
          size={20}
          variant="Bulk"
        />
        <Collapsible collapsed={collapsed}>
          <span
            className={cn(
              'text-body-medium truncate whitespace-nowrap',
              selected ? 'text-white' : 'text-text-secondary',
            )}
          >
            {label}
          </span>
        </Collapsible>
      </span>
    </>
  );

  if (!item.available) {
    return (
      <button
        aria-label={label}
        className={className}
        disabled
        title={collapsed ? label : undefined}
        type="button"
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      aria-current={selected ? 'page' : undefined}
      aria-label={label}
      className={className}
      href={href}
      title={collapsed ? label : undefined}
      {...(onNavigate ? { onNavigate } : {})}
    >
      {content}
    </Link>
  );
}

export function CompactNavigationCategory({
  group,
  items,
  label,
  locale,
  onExpand,
  pathname,
}: {
  group: DashboardNavigationGroup;
  items: DashboardNavigationItem[];
  label: string;
  locale: Locale;
  onExpand: (group: DashboardNavigationGroup) => void;
  pathname: string;
}) {
  const Icon = navigationGroupIcons[group];
  const containsCurrentPage = items.some((item) =>
    isNavigationItemSelected(item, locale, pathname),
  );

  return (
    <button
      aria-label={label}
      className={cn(
        'group/compact-category relative grid size-9 cursor-pointer place-items-center rounded-xl outline-none',
        'transition-[background-color,box-shadow,transform] duration-150 ease-out motion-reduce:transform-none motion-reduce:transition-none',
        'hover:scale-[1.045] hover:bg-background-tertiary-hover active:scale-[0.94]',
        'focus-visible:ring-2 focus-visible:ring-border-focus-ring focus-visible:ring-inset',
        containsCurrentPage && 'bg-background-tertiary-default shadow-control',
      )}
      data-compact-category={group}
      onClick={() => onExpand(group)}
      title={label}
      type="button"
    >
      <span
        aria-hidden
        className={cn(
          'absolute start-0 h-3.5 w-0.5 origin-center rounded-full bg-accent-500 opacity-0 transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none',
          containsCurrentPage ? 'scale-y-100 opacity-100' : 'scale-y-50',
        )}
      />
      <Icon
        aria-hidden
        color={containsCurrentPage ? 'var(--color-accent-600)' : sidebarIconColor}
        size={20}
        variant="Bulk"
      />
    </button>
  );
}

export function NavigationCategory({
  closing,
  group,
  itemLabels,
  items,
  label,
  locale,
  opening,
  onNavigate,
  onMotionAnimationEnd,
  pathname,
}: {
  closing: boolean;
  group: DashboardNavigationGroup;
  itemLabels: Record<DashboardNavigationKey, string>;
  items: DashboardNavigationItem[];
  label: string;
  locale: Locale;
  opening: boolean;
  onNavigate?: () => void;
  onMotionAnimationEnd: (group: DashboardNavigationGroup, motion: 'closing' | 'opening') => void;
  pathname: string;
}) {
  const Icon = navigationGroupIcons[group];
  const containsCurrentPage = items.some((item) =>
    isNavigationItemSelected(item, locale, pathname),
  );

  return (
    <Disclosure className="group/navigation-category" data-navigation-category={group} id={group}>
      {({ isExpanded }) => (
        <>
          <DisclosureTrigger
            aria-label={label}
            className={cn(
              'flex min-h-9 w-full cursor-pointer items-center justify-between rounded-xl px-2 outline-none',
              'transition-[background-color,transform] duration-150 ease-out hover:scale-[1.008] hover:bg-background-secondary-hover active:scale-[0.985] motion-reduce:transform-none motion-reduce:transition-none',
              'focus-visible:ring-2 focus-visible:ring-border-focus-ring focus-visible:ring-inset',
              containsCurrentPage && 'bg-background-tertiary-default',
            )}
            slot="trigger"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Icon aria-hidden color={sidebarIconColor} size={18} variant="Bulk" />
              <span className="truncate text-body-semibold text-text-primary">{label}</span>
            </span>
            <span className="flex shrink-0 items-center">
              <span
                className={cn(
                  'grid size-4 place-items-center transition-transform duration-200 ease-out motion-reduce:transition-none',
                  isExpanded && 'rotate-180',
                )}
              >
                <ArrowDown2 aria-hidden color={sidebarIconTertiaryColor} size={14} variant="Bulk" />
              </span>
            </span>
          </DisclosureTrigger>
          <DisclosurePanel className="sidebar-category-panel">
            <div
              className={cn(
                'sidebar-category-motion',
                opening && 'sidebar-category-motion--opening',
                closing && 'sidebar-category-motion--closing',
              )}
              data-sidebar-closing={closing ? 'true' : undefined}
              data-sidebar-opening={opening ? 'true' : undefined}
              onAnimationEnd={(event) => {
                if (event.currentTarget !== event.target) return;
                if (closing) onMotionAnimationEnd(group, 'closing');
                else if (opening) onMotionAnimationEnd(group, 'opening');
              }}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="pt-1">
                  <div className="ms-4 flex flex-col gap-1 border-s border-border-button-default ps-2">
                    {items.map((item) => (
                      <NavigationItem
                        collapsed={false}
                        item={item}
                        key={item.key}
                        label={itemLabels[item.key]}
                        locale={locale}
                        pathname={pathname}
                        {...(onNavigate ? { onNavigate } : {})}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </DisclosurePanel>
        </>
      )}
    </Disclosure>
  );
}
