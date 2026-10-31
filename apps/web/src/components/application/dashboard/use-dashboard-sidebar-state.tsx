'use client';

import { SidebarLeft, SidebarRight } from 'iconsax-react';
import { usePathname } from 'next/navigation';
import {
  type Dispatch,
  type Key,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import {
  type DashboardNavigationGroup,
  type DashboardNavigationItem,
  getPrimaryRoleCode,
  getVisibleNavigation,
} from '@/features/dashboard/navigation';
import { dashboardNavigationGroupOrder } from '@/features/dashboard/sidebar-preferences';
import { getAppCopy } from '@/i18n/app-copy';
import type { Locale } from '@/lib/locales';
import { isNavigationGroup } from './sidebar-parts';

export function useDashboardSidebarState({
  className,
  collapsed: collapsedProp = false,
  expandedGroups,
  flat = false,
  locale,
  logoutPending,
  mobile = false,
  onCollapsedChange,
  onExpandedGroupsChange,
  onLanguageSwitch,
  onLogout,
  onNavigate,
  user,
}: {
  className?: string;
  collapsed?: boolean;
  expandedGroups: Set<DashboardNavigationGroup>;
  flat?: boolean;
  locale: Locale;
  logoutPending: boolean;
  mobile?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onExpandedGroupsChange: Dispatch<SetStateAction<Set<DashboardNavigationGroup>>>;
  onLanguageSwitch: () => void;
  onLogout: () => void;
  onNavigate?: () => void;
  user: DashboardUser;
}) {
  const copy = getAppCopy(locale).shell;
  const [usesCommandShortcut, setUsesCommandShortcut] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const [query, setQuery] = useState('');
  const [closingGroups, setClosingGroups] = useState<Set<DashboardNavigationGroup>>(
    () => new Set(),
  );
  const [openingGroups, setOpeningGroups] = useState<Set<DashboardNavigationGroup>>(
    () => new Set(),
  );
  const searchFieldRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const SidebarIcon = locale === 'ar' ? SidebarRight : SidebarLeft;
  const collapsed = mobile ? false : collapsedProp;
  const roleCode = getPrimaryRoleCode(user);
  const visibleItems = useMemo(() => getVisibleNavigation(user), [user]);
  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  const filteredItems = useMemo(
    () =>
      visibleItems.filter((item) =>
        copy.navigation[item.key].toLocaleLowerCase(locale).includes(normalizedQuery),
      ),
    [copy.navigation, locale, normalizedQuery, visibleItems],
  );
  const groupedNavigation = useMemo(() => {
    const itemsByGroup = new Map<DashboardNavigationGroup, DashboardNavigationItem[]>();
    const ungrouped: DashboardNavigationItem[] = [];
    for (const group of dashboardNavigationGroupOrder) itemsByGroup.set(group, []);
    for (const item of filteredItems) {
      if (!item.group) {
        ungrouped.push(item);
        continue;
      }
      itemsByGroup.get(item.group)?.push(item);
    }
    const groups = dashboardNavigationGroupOrder.flatMap((group) => {
      const items = itemsByGroup.get(group) ?? [];
      return items.length > 0 ? [{ group, items }] : [];
    });
    return { groups, ungrouped };
  }, [filteredItems]);
  const displayedExpandedGroups = useMemo(
    () =>
      normalizedQuery
        ? new Set(groupedNavigation.groups.map(({ group }) => group))
        : new Set([...expandedGroups, ...closingGroups]),
    [closingGroups, expandedGroups, groupedNavigation.groups, normalizedQuery],
  );

  const deactivateSearch = useCallback((restoreFocus: boolean) => {
    setQuery('');
    setSearchActive(false);
    if (restoreFocus) window.requestAnimationFrame(() => searchTriggerRef.current?.focus());
  }, []);

  const activateSearch = useCallback(() => {
    if (!mobile) onCollapsedChange?.(false);
    setSearchActive(true);
  }, [mobile, onCollapsedChange]);

  const expandNavigationGroup = useCallback(
    (group: DashboardNavigationGroup) => {
      if (!expandedGroups.has(group)) {
        setOpeningGroups((currentGroups) => new Set(currentGroups).add(group));
      }
      onExpandedGroupsChange((currentGroups) => {
        const nextGroups = new Set(currentGroups);
        nextGroups.add(group);
        return nextGroups;
      });
      setClosingGroups((currentGroups) => {
        if (!currentGroups.has(group)) return currentGroups;
        const nextGroups = new Set(currentGroups);
        nextGroups.delete(group);
        return nextGroups;
      });
      onCollapsedChange?.(false);
    },
    [expandedGroups, onCollapsedChange, onExpandedGroupsChange],
  );

  const updateExpandedGroups = useCallback(
    (keys: Set<Key>) => {
      if (normalizedQuery) return;
      const requestedGroups = new Set([...keys].filter(isNavigationGroup));
      const displayedGroups = new Set([...expandedGroups, ...closingGroups]);
      const groupsToClose = [...displayedGroups].filter((group) => !requestedGroups.has(group));
      const groupsToOpen = [...requestedGroups].filter((group) => !displayedGroups.has(group));

      if (groupsToClose.length > 0) {
        setOpeningGroups((currentGroups) => {
          const nextGroups = new Set(currentGroups);
          for (const group of groupsToClose) nextGroups.delete(group);
          return nextGroups;
        });
        setClosingGroups((currentGroups) => new Set([...currentGroups, ...groupsToClose]));
        onExpandedGroupsChange((currentGroups) => {
          const nextGroups = new Set(currentGroups);
          for (const group of groupsToClose) nextGroups.delete(group);
          return nextGroups;
        });
      }

      if (groupsToOpen.length > 0) {
        setOpeningGroups((currentGroups) => new Set([...currentGroups, ...groupsToOpen]));
        setClosingGroups((currentGroups) => {
          const nextGroups = new Set(currentGroups);
          for (const group of groupsToOpen) nextGroups.delete(group);
          return nextGroups;
        });
        onExpandedGroupsChange((currentGroups) => {
          const nextGroups = new Set(currentGroups);
          for (const group of groupsToOpen) nextGroups.add(group);
          return nextGroups;
        });
      }
    },
    [closingGroups, expandedGroups, normalizedQuery, onExpandedGroupsChange],
  );

  const finishGroupMotion = useCallback(
    (group: DashboardNavigationGroup, motion: 'closing' | 'opening') => {
      const setMotionGroups = motion === 'closing' ? setClosingGroups : setOpeningGroups;
      setMotionGroups((currentGroups) => {
        if (!currentGroups.has(group)) return currentGroups;
        const nextGroups = new Set(currentGroups);
        nextGroups.delete(group);
        return nextGroups;
      });
    },
    [],
  );

  useEffect(() => {
    setUsesCommandShortcut(/Mac|iPhone|iPad|iPod/i.test(navigator.platform));
  }, []);

  useEffect(() => {
    if (!searchActive) return;
    const frame = window.requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [searchActive]);

  useEffect(() => {
    if (!searchActive) return;
    const onOutsideClick = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && searchFieldRef.current?.contains(target)) return;
      deactivateSearch(false);
    };
    document.addEventListener('click', onOutsideClick);
    return () => document.removeEventListener('click', onOutsideClick);
  }, [deactivateSearch, searchActive]);

  useEffect(() => {
    if (mobile) return;
    const onShortcut = (event: KeyboardEvent) => {
      const hasExpectedModifier = usesCommandShortcut
        ? event.metaKey && !event.altKey && !event.ctrlKey
        : event.altKey && !event.ctrlKey && !event.metaKey;
      if (event.code !== 'KeyK' || !hasExpectedModifier || event.shiftKey) {
        return;
      }
      event.preventDefault();
      activateSearch();
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [activateSearch, mobile, usesCommandShortcut]);
  return {
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
  };
}
