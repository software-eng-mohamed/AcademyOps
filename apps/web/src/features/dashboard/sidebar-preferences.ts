import type { DashboardNavigationGroup } from './navigation';

const SIDEBAR_PREFERENCES_KEY = 'plg:dashboard-sidebar:v1';
const SIDEBAR_PREFERENCES_VERSION = 1;
const SIDEBAR_PREFERENCES_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const DASHBOARD_SIDEBAR_PREFERENCES_COOKIE = 'plg_dashboard_sidebar';

export const dashboardNavigationGroupOrder = [
  'personal',
  'academy',
  'operations',
  'finance',
  'system',
] as const satisfies readonly DashboardNavigationGroup[];

const dashboardNavigationGroups = new Set<string>(dashboardNavigationGroupOrder);

export type DashboardSidebarPreferences = {
  collapsed: boolean;
  expandedGroups: DashboardNavigationGroup[];
};

type StoredDashboardSidebarPreferences = DashboardSidebarPreferences & {
  version: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDashboardNavigationGroup(value: unknown): value is DashboardNavigationGroup {
  return typeof value === 'string' && dashboardNavigationGroups.has(value);
}

export function createDefaultExpandedDashboardGroups() {
  return new Set<DashboardNavigationGroup>(dashboardNavigationGroupOrder);
}

export function createDefaultDashboardSidebarPreferences(): DashboardSidebarPreferences {
  return {
    collapsed: false,
    expandedGroups: [...dashboardNavigationGroupOrder],
  };
}

function normalizeDashboardSidebarPreferences(parsed: unknown): DashboardSidebarPreferences | null {
  if (!isRecord(parsed) || parsed.version !== SIDEBAR_PREFERENCES_VERSION) return null;
  if (typeof parsed.collapsed !== 'boolean' || !Array.isArray(parsed.expandedGroups)) return null;

  return {
    collapsed: parsed.collapsed,
    expandedGroups: [...new Set(parsed.expandedGroups.filter(isDashboardNavigationGroup))],
  };
}

function toStoredDashboardSidebarPreferences(
  preferences: DashboardSidebarPreferences,
): StoredDashboardSidebarPreferences {
  return {
    collapsed: preferences.collapsed,
    expandedGroups: [...new Set(preferences.expandedGroups.filter(isDashboardNavigationGroup))],
    version: SIDEBAR_PREFERENCES_VERSION,
  };
}

export function parseDashboardSidebarPreferences(
  value: string | null | undefined,
): DashboardSidebarPreferences | null {
  if (!value) return null;

  try {
    return normalizeDashboardSidebarPreferences(JSON.parse(decodeURIComponent(value)));
  } catch {
    return null;
  }
}

export function serializeDashboardSidebarPreferences(
  preferences: DashboardSidebarPreferences,
): string {
  return encodeURIComponent(JSON.stringify(toStoredDashboardSidebarPreferences(preferences)));
}

export function loadDashboardSidebarPreferences(): DashboardSidebarPreferences | null {
  if (typeof window === 'undefined') return null;
  return parseDashboardSidebarPreferences(window.localStorage.getItem(SIDEBAR_PREFERENCES_KEY));
}

export function saveDashboardSidebarPreferences(preferences: DashboardSidebarPreferences) {
  if (typeof window === 'undefined') return;

  const storedPreferences = toStoredDashboardSidebarPreferences(preferences);
  const serializedPreferences = JSON.stringify(storedPreferences);

  try {
    window.localStorage.setItem(SIDEBAR_PREFERENCES_KEY, serializedPreferences);
  } catch {
    // Local storage is a best-effort compatibility copy.
  }

  try {
    // biome-ignore lint/suspicious/noDocumentCookie: the server needs this non-sensitive UI preference before hydration.
    document.cookie = `${DASHBOARD_SIDEBAR_PREFERENCES_COOKIE}=${encodeURIComponent(serializedPreferences)}; Path=/; Max-Age=${SIDEBAR_PREFERENCES_MAX_AGE_SECONDS}; SameSite=Lax`;
  } catch {
    // Cookie storage may be disabled. The in-memory state still works.
  }
}
