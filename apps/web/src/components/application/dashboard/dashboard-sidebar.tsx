'use client';
import { cn } from '@academyops/ui';
import { CloseCircle, SearchNormal } from 'iconsax-react';

import { DisclosureGroup } from 'react-aria-components';
import { AnimatedThemeToggler } from '@/components/base/buttons/animated-theme-toggler';
import { AccountMenu } from './sidebar-account-menu';
import {
  CompactNavigationCategory,
  NavigationCategory,
  NavigationItem,
} from './sidebar-navigation';
import { Collapsible, sidebarIconColor } from './sidebar-parts';
import { useDashboardSidebarState } from './use-dashboard-sidebar-state';
export function DashboardSidebar(props: Parameters<typeof useDashboardSidebarState>[0]) {
  const {
    className,
    flat,
    locale,
    logoutPending,
    mobile,
    onCollapsedChange,
    onLanguageSwitch,
    onLogout,
    onNavigate,
    user,
    copy,
    usesCommandShortcut,
    searchActive,
    query,
    setQuery,
    closingGroups,
    openingGroups,
    searchFieldRef,
    searchInputRef,
    searchTriggerRef,
    pathname,
    SidebarIcon,
    collapsed,
    roleCode,
    filteredItems,
    groupedNavigation,
    displayedExpandedGroups,
    deactivateSearch,
    activateSearch,
    expandNavigationGroup,
    updateExpandedGroups,
    finishGroupMotion,
  } = useDashboardSidebarState(props);
  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col justify-between overflow-hidden',
        flat
          ? 'bg-background-full'
          : 'rounded-3xl border border-border-button-white bg-background-secondary-default shadow-sidebar',
        'transition-[width,padding] duration-[260ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none',
        collapsed ? 'w-[60px] px-[11px] py-3' : 'w-[260px] p-3',
        className,
      )}
      data-sidebar
      data-sidebar-collapsed={collapsed ? 'true' : 'false'}
      data-sidebar-role={roleCode ?? 'NONE'}
      data-sidebar-source="boardui"
    >
      <div
        className="-mx-2 -mt-2 flex min-h-0 w-[calc(100%+16px)] flex-1 flex-col gap-3 overflow-y-auto p-2 [scrollbar-width:none]"
        data-sidebar-scroll-region
      >
        <div
          className={cn(
            'flex w-full transition-[gap] duration-300 ease-in-out motion-reduce:transition-none',
            collapsed
              ? 'flex-col-reverse items-center justify-center gap-2.5'
              : 'flex-row items-center justify-between',
          )}
        >
          <AccountMenu
            collapsed={collapsed}
            locale={locale}
            logoutPending={logoutPending}
            mobile={mobile}
            onLanguageSwitch={onLanguageSwitch}
            onLogout={onLogout}
            user={user}
          />
          {mobile ? (
            <button
              aria-label={copy.closeNavigation}
              className="cursor-pointer text-foreground-icon-secondary"
              onClick={onNavigate}
              type="button"
            >
              <CloseCircle aria-hidden color={sidebarIconColor} size={20} variant="Bulk" />
            </button>
          ) : (
            <button
              aria-expanded={!collapsed}
              aria-label={collapsed ? copy.expandNavigation : copy.collapseNavigation}
              className={cn(
                'grid size-9 cursor-pointer place-items-center rounded-xl text-foreground-icon-secondary',
                'transition-[background-color,transform] duration-150 ease-out hover:scale-[1.045] hover:bg-background-tertiary-default active:scale-[0.94] motion-reduce:transform-none motion-reduce:transition-none',
              )}
              onClick={() => {
                deactivateSearch(false);
                onCollapsedChange?.(!collapsed);
              }}
              type="button"
            >
              <SidebarIcon aria-hidden color={sidebarIconColor} size={20} variant="Bulk" />
            </button>
          )}
        </div>

        <div className="flex w-full flex-col gap-3">
          {collapsed ? null : searchActive ? (
            <div
              className="sidebar-search-field flex w-full items-center gap-2 rounded-full bg-background-tertiary-default py-2 pe-2.5 ps-2 ring-2 ring-inset ring-border-button-active transition-[background-color,box-shadow] duration-150"
              ref={searchFieldRef}
            >
              <SearchNormal
                aria-hidden
                className="shrink-0"
                color={sidebarIconColor}
                size={20}
                variant="Bulk"
              />
              <input
                aria-label={copy.searchNavigation}
                className="min-w-0 flex-1 bg-transparent text-body-medium text-text-primary outline-none placeholder:text-text-tertiary"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Escape') return;
                  event.preventDefault();
                  deactivateSearch(true);
                }}
                placeholder={copy.searchNavigation}
                ref={searchInputRef}
                type="search"
                value={query}
              />
              <button
                aria-label={copy.closeNavigation}
                className="grid size-5 shrink-0 place-items-center rounded-full bg-background-tertiary-hover text-foreground-icon-secondary"
                onClick={() => deactivateSearch(true)}
                type="button"
              >
                <CloseCircle aria-hidden color={sidebarIconColor} size={14} variant="Bulk" />
              </button>
            </div>
          ) : (
            <button
              aria-keyshortcuts={usesCommandShortcut ? 'Meta+K' : 'Alt+K'}
              aria-label={copy.searchNavigation}
              className={cn(
                'flex cursor-pointer items-center gap-2 p-2 hover:bg-background-tertiary-hover/55',
                'transition-[width,border-radius,background-color,transform] duration-200 ease-out hover:scale-[1.012] active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none',
                'w-full rounded-full bg-background-tertiary-default',
              )}
              onClick={activateSearch}
              ref={searchTriggerRef}
              type="button"
            >
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <SearchNormal
                  aria-hidden
                  className="shrink-0"
                  color={sidebarIconColor}
                  size={20}
                  variant="Bulk"
                />
                <span className="text-body-medium whitespace-nowrap text-text-secondary">
                  {copy.searchNavigation}
                </span>
              </span>
              <kbd className="rounded-md bg-kbd-background px-1.5 py-0.5 font-mono text-[10px] font-medium text-kbd-foreground">
                ⌘ K
              </kbd>
            </button>
          )}

          <nav
            aria-label={copy.navigationLabel}
            className={cn('flex w-full flex-col gap-1', !collapsed && 'px-0.5')}
          >
            {collapsed ? (
              <>
                {groupedNavigation.ungrouped.map((item) => (
                  <NavigationItem
                    collapsed
                    item={item}
                    key={item.key}
                    label={copy.navigation[item.key]}
                    locale={locale}
                    pathname={pathname}
                    {...(onNavigate ? { onNavigate } : {})}
                  />
                ))}
                {groupedNavigation.ungrouped.length > 0 && groupedNavigation.groups.length > 0 ? (
                  <span aria-hidden className="mx-auto my-1 h-px w-6 bg-border-button-default" />
                ) : null}
                {groupedNavigation.groups.map(({ group, items }) => (
                  <CompactNavigationCategory
                    group={group}
                    items={items}
                    key={group}
                    label={copy.navigationGroups[group]}
                    locale={locale}
                    onExpand={expandNavigationGroup}
                    pathname={pathname}
                  />
                ))}
              </>
            ) : (
              <>
                {groupedNavigation.ungrouped.map((item) => (
                  <NavigationItem
                    collapsed={false}
                    item={item}
                    key={item.key}
                    label={copy.navigation[item.key]}
                    locale={locale}
                    pathname={pathname}
                    {...(onNavigate ? { onNavigate } : {})}
                  />
                ))}
                <DisclosureGroup
                  allowsMultipleExpanded
                  className="mt-1 flex flex-col gap-1"
                  expandedKeys={displayedExpandedGroups}
                  onExpandedChange={updateExpandedGroups}
                >
                  {groupedNavigation.groups.map(({ group, items }) => (
                    <NavigationCategory
                      closing={closingGroups.has(group)}
                      group={group}
                      itemLabels={copy.navigation}
                      items={items}
                      key={group}
                      label={copy.navigationGroups[group]}
                      locale={locale}
                      opening={openingGroups.has(group)}
                      onMotionAnimationEnd={finishGroupMotion}
                      pathname={pathname}
                      {...(onNavigate ? { onNavigate } : {})}
                    />
                  ))}
                </DisclosureGroup>
              </>
            )}
            {filteredItems.length === 0 && !collapsed ? (
              <p className="px-2 py-3 text-body-regular text-text-tertiary">
                {copy.noNavigationResults}
              </p>
            ) : null}
          </nav>
        </div>
      </div>

      <div className="w-full shrink-0 pt-3" data-sidebar-footer>
        <div
          className={cn(
            'flex items-center rounded-xl bg-background-tertiary-default p-1',
            collapsed ? 'justify-center bg-transparent' : 'justify-between ps-3',
          )}
        >
          <Collapsible collapsed={collapsed}>
            <span className="text-body-medium whitespace-nowrap text-text-secondary">
              {copy.appearance}
            </span>
          </Collapsible>
          <AnimatedThemeToggler
            className={cn(
              'grid size-9 shrink-0 cursor-pointer place-items-center rounded-xl text-foreground-icon-secondary outline-none',
              'transition-[background-color,color,transform] duration-150 ease-out hover:scale-[1.045] hover:bg-background-tertiary-hover hover:text-accent-600 active:scale-[0.94] motion-reduce:transform-none motion-reduce:transition-none',
              'focus-visible:ring-2 focus-visible:ring-border-focus-ring focus-visible:ring-inset',
            )}
            darkThemeLabel={copy.switchToDarkTheme}
            lightThemeLabel={copy.switchToLightTheme}
          />
        </div>
      </div>
    </aside>
  );
}
