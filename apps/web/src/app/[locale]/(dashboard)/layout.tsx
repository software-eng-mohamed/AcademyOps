import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { readCurrentUser } from '@/api/server/current-user';
import { AppShell } from '@/components/app-shell';
import { DASHBOARD_INITIAL_LOADER_COOKIE } from '@/features/dashboard/initial-loader-preference';
import {
  createDefaultDashboardSidebarPreferences,
  DASHBOARD_SIDEBAR_PREFERENCES_COOKIE,
  parseDashboardSidebarPreferences,
} from '@/features/dashboard/sidebar-preferences';
import { isLocale } from '@/lib/locales';

export default async function DashboardLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const [user, cookieStore] = await Promise.all([readCurrentUser(), cookies()]);
  if (!user) redirect(`/${locale}/login`);
  const initialSidebarPreferences =
    parseDashboardSidebarPreferences(
      cookieStore.get(DASHBOARD_SIDEBAR_PREFERENCES_COOKIE)?.value,
    ) ?? createDefaultDashboardSidebarPreferences();
  const showInitialLoader = !cookieStore.has(DASHBOARD_INITIAL_LOADER_COOKIE);
  return (
    <AppShell
      demo={process.env.ACADEMYOPS_DEMO_ONLY === 'true'}
      initialSidebarPreferences={initialSidebarPreferences}
      showInitialLoader={showInitialLoader}
      user={user}
    >
      {children}
    </AppShell>
  );
}
