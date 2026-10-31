import type { Locator, Page } from '@playwright/test';

export async function authenticate(page: Page, options: { loaderSeen?: boolean } = {}) {
  const cookies = [
    {
      domain: '127.0.0.1',
      httpOnly: true,
      name: 'plg_session',
      path: '/',
      sameSite: 'Lax' as const,
      value: 'test-session',
    },
    {
      domain: '127.0.0.1',
      name: 'plg_csrf',
      path: '/',
      sameSite: 'Lax' as const,
      value: 'test-csrf',
    },
  ];
  if (options.loaderSeen !== false) {
    cookies.push({
      domain: '127.0.0.1',
      name: 'plg_dashboard_loader_seen',
      path: '/',
      sameSite: 'Lax' as const,
      value: '1',
    });
  }
  await page.context().addCookies(cookies);
}

export async function clickAndCaptureAnimation(trigger: Locator, animationTarget: Locator) {
  const [animation] = await Promise.all([
    animationTarget.evaluate(
      (element) =>
        new Promise<{ duration: string; name: string }>((resolve) => {
          element.addEventListener(
            'animationstart',
            (event) =>
              resolve({
                duration: getComputedStyle(element).animationDuration,
                name: (event as AnimationEvent).animationName,
              }),
            { once: true },
          );
        }),
    ),
    trigger.click(),
  ]);
  return animation;
}

type StoredSidebarPreferences = {
  collapsed: boolean;
  expandedGroups: string[];
  version: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function readSidebarPreferences(page: Page): Promise<StoredSidebarPreferences | null> {
  const stored = await page.evaluate(() => window.localStorage.getItem('plg:dashboard-sidebar:v1'));
  if (!stored) return null;
  const parsed: unknown = JSON.parse(stored);
  if (!isRecord(parsed)) return null;
  if (
    typeof parsed.collapsed !== 'boolean' ||
    typeof parsed.version !== 'number' ||
    !Array.isArray(parsed.expandedGroups) ||
    !parsed.expandedGroups.every((group) => typeof group === 'string')
  ) {
    return null;
  }
  return {
    collapsed: parsed.collapsed,
    expandedGroups: parsed.expandedGroups,
    version: parsed.version,
  };
}
