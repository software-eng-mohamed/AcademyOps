'use client';

import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  IconButton,
  SkipLink,
  useToast,
} from '@academyops/ui';
import { useQueryClient } from '@tanstack/react-query';
import { HambergerMenu } from 'iconsax-react';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { AUTH_EXPIRED_EVENT } from '@/api/browser/auth-events';
import { useAuthControllerLogoutV1 } from '@/api/generated/identity/identity';
import { DashboardInitialLoader } from '@/components/application/dashboard/dashboard-initial-loader';
import { DashboardSidebar } from '@/components/application/dashboard/dashboard-sidebar';
import { AcademyOpsMark } from '@/components/brand/academyops-mark';
import { LocaleDocumentAttributes } from '@/components/locale-document-attributes';
import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import type { DashboardNavigationGroup } from '@/features/dashboard/navigation';
import {
  type DashboardSidebarPreferences,
  saveDashboardSidebarPreferences,
} from '@/features/dashboard/sidebar-preferences';
import { getAppCopy } from '@/i18n/app-copy';
import { localeFromPath } from '@/lib/locales';

export function AppShell({
  children,
  initialSidebarPreferences,
  showInitialLoader,
  user,
}: {
  children: ReactNode;
  initialSidebarPreferences: DashboardSidebarPreferences;
  showInitialLoader: boolean;
  user: DashboardUser;
}) {
  const pathname = usePathname();
  const locale = localeFromPath(pathname);
  const appCopy = getAppCopy(locale);
  const copy = appCopy.shell;
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [collapsed, setCollapsed] = useState(initialSidebarPreferences.collapsed);
  const [expandedGroups, setExpandedGroups] = useState<Set<DashboardNavigationGroup>>(
    () => new Set(initialSidebarPreferences.expandedGroups),
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const nextLocale = locale === 'ar' ? 'en' : 'ar';
  const localizedPath = pathname.replace(/^\/(ar|en)(?=\/|$)/, `/${nextLocale}`);

  const returnToLogin = useCallback(() => {
    queryClient.clear();
    router.replace(`/${locale}/login`);
    router.refresh();
  }, [locale, queryClient, router]);

  const logout = useAuthControllerLogoutV1({
    mutation: {
      retry: false,
      onError: () =>
        toast.add({
          description: copy.logoutErrorDescription,
          title: copy.logoutError,
          type: 'error',
        }),
      onSuccess: returnToLogin,
    },
  });

  useEffect(() => {
    window.addEventListener(AUTH_EXPIRED_EVENT, returnToLogin);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, returnToLogin);
  }, [returnToLogin]);

  useEffect(() => {
    saveDashboardSidebarPreferences({
      collapsed,
      expandedGroups: [...expandedGroups],
    });
  }, [collapsed, expandedGroups]);

  const switchLanguage = useCallback(() => {
    window.history.replaceState(
      null,
      '',
      `${localizedPath}${window.location.search}${window.location.hash}`,
    );
  }, [localizedPath]);

  return (
    <div
      className="flex h-dvh overflow-hidden bg-[var(--color-background-auth-page)] text-text-primary"
      data-dashboard-shell
    >
      <LocaleDocumentAttributes locale={locale} />
      <DashboardInitialLoader label={appCopy.loading} show={showInitialLoader} />
      <SkipLink href="#main-content">{copy.skipToContent}</SkipLink>

      <div className="hidden shrink-0 p-3 pe-0 lg:block">
        <DashboardSidebar
          collapsed={collapsed}
          expandedGroups={expandedGroups}
          locale={locale}
          logoutPending={logout.isPending}
          onCollapsedChange={setCollapsed}
          onExpandedGroupsChange={setExpandedGroups}
          onLanguageSwitch={switchLanguage}
          onLogout={() => logout.mutate()}
          user={user}
        />
      </div>

      <Drawer onOpenChange={setMobileOpen} open={mobileOpen}>
        <DrawerContent
          className="flex w-[min(92vw,280px)] flex-col bg-background-full"
          variant="navigation"
        >
          <DrawerHeader className="sr-only">
            <DrawerTitle>{copy.navigationLabel}</DrawerTitle>
          </DrawerHeader>
          <DrawerBody className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
            <DashboardSidebar
              className="w-full"
              expandedGroups={expandedGroups}
              flat
              locale={locale}
              logoutPending={logout.isPending}
              mobile
              onExpandedGroupsChange={setExpandedGroups}
              onLanguageSwitch={switchLanguage}
              onLogout={() => logout.mutate()}
              onNavigate={() => setMobileOpen(false)}
              user={user}
            />
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center border-b border-border-button-default px-4 lg:hidden">
          <IconButton label={copy.openNavigation} onClick={() => setMobileOpen(true)} tone="ghost">
            <HambergerMenu
              aria-hidden
              color="var(--color-foreground-icon-secondary)"
              size={20}
              variant="Bulk"
            />
          </IconButton>
          <span
            className="ms-2 inline-flex items-center gap-2 text-body-semibold text-text-primary"
            dir="ltr"
          >
            <AcademyOpsMark className="size-7" />
            <span>{appCopy.brand}</span>
          </span>
        </header>

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto" id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
