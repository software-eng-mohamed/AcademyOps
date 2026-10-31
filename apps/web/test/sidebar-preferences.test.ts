import { afterEach, describe, expect, it } from 'vitest';
import {
  createDefaultDashboardSidebarPreferences,
  createDefaultExpandedDashboardGroups,
  DASHBOARD_SIDEBAR_PREFERENCES_COOKIE,
  loadDashboardSidebarPreferences,
  parseDashboardSidebarPreferences,
  saveDashboardSidebarPreferences,
  serializeDashboardSidebarPreferences,
} from '@/features/dashboard/sidebar-preferences';

afterEach(() => {
  window.localStorage.clear();
  // biome-ignore lint/suspicious/noDocumentCookie: tests reset the UI preference cookie they create.
  document.cookie = `${DASHBOARD_SIDEBAR_PREFERENCES_COOKIE}=; Path=/; Max-Age=0`;
});

describe('dashboard sidebar preferences', () => {
  it('starts with every navigation group expanded', () => {
    expect([...createDefaultExpandedDashboardGroups()]).toEqual([
      'personal',
      'academy',
      'operations',
      'finance',
      'system',
    ]);
    expect(createDefaultDashboardSidebarPreferences()).toEqual({
      collapsed: false,
      expandedGroups: ['personal', 'academy', 'operations', 'finance', 'system'],
    });
  });

  it('persists only the collapsed state and valid expanded group ids', () => {
    saveDashboardSidebarPreferences({
      collapsed: true,
      expandedGroups: ['academy', 'finance'],
    });

    expect(loadDashboardSidebarPreferences()).toEqual({
      collapsed: true,
      expandedGroups: ['academy', 'finance'],
    });
    expect(window.localStorage.getItem('plg:dashboard-sidebar:v1')).toBe(
      '{"collapsed":true,"expandedGroups":["academy","finance"],"version":1}',
    );
    const cookieValue = document.cookie
      .split('; ')
      .find((cookie) => cookie.startsWith(`${DASHBOARD_SIDEBAR_PREFERENCES_COOKIE}=`))
      ?.split('=')
      .slice(1)
      .join('=');
    expect(parseDashboardSidebarPreferences(cookieValue)).toEqual({
      collapsed: true,
      expandedGroups: ['academy', 'finance'],
    });
  });

  it('serializes a server-readable cookie value', () => {
    const serialized = serializeDashboardSidebarPreferences({
      collapsed: true,
      expandedGroups: ['operations'],
    });

    expect(parseDashboardSidebarPreferences(serialized)).toEqual({
      collapsed: true,
      expandedGroups: ['operations'],
    });
  });

  it('rejects incompatible storage and filters unknown groups', () => {
    window.localStorage.setItem(
      'plg:dashboard-sidebar:v1',
      JSON.stringify({ collapsed: false, expandedGroups: ['academy', 'unknown'], version: 1 }),
    );
    expect(loadDashboardSidebarPreferences()).toEqual({
      collapsed: false,
      expandedGroups: ['academy'],
    });

    window.localStorage.setItem(
      'plg:dashboard-sidebar:v1',
      JSON.stringify({ collapsed: false, expandedGroups: [], version: 2 }),
    );
    expect(loadDashboardSidebarPreferences()).toBeNull();
  });
});
