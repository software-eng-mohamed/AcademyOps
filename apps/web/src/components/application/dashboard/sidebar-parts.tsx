'use client';

import { cn } from '@academyops/ui';
import {
  Archive,
  Award,
  Bank,
  Book,
  Briefcase,
  Buildings,
  Calendar,
  Calendar2,
  CalendarTick,
  Chart2,
  ClipboardTick,
  DocumentText,
  DocumentUpload,
  Home2,
  type Icon as IconsaxIcon,
  People,
  ProfileAdd,
  ReceiptText,
  SecurityUser,
  Teacher,
  UserAdd,
  UserSearch,
  Wallet3,
  WalletMoney,
  Whatsapp,
} from 'iconsax-react';

import type { ReactNode } from 'react';

import type {
  DashboardNavigationGroup,
  DashboardNavigationItem,
  DashboardNavigationKey,
} from '@/features/dashboard/navigation';
import { dashboardNavigationGroupOrder } from '@/features/dashboard/sidebar-preferences';

import type { Locale } from '@/lib/locales';
export const navigationIcons: Record<DashboardNavigationKey, IconsaxIcon> = {
  access: SecurityUser,
  attendance: ClipboardTick,
  audit: DocumentText,
  businessAccounts: Briefcase,
  certificates: Award,
  cohorts: People,
  dashboard: Home2,
  documents: ReceiptText,
  enrollments: Book,
  finance: Bank,
  imports: DocumentUpload,
  leads: ProfileAdd,
  legacyArchive: Archive,
  myAttendance: CalendarTick,
  myCertificates: Award,
  myFinance: WalletMoney,
  myLearning: Teacher,
  mySchedule: Calendar,
  payments: Wallet3,
  programs: Teacher,
  registrations: UserAdd,
  reports: Chart2,
  resources: Buildings,
  sessions: Calendar2,
  students: UserSearch,
  whatsapp: Whatsapp,
};

export const navigationGroupIcons: Record<DashboardNavigationGroup, IconsaxIcon> = {
  academy: Teacher,
  finance: Wallet3,
  operations: CalendarTick,
  personal: UserSearch,
  system: SecurityUser,
};

export const sidebarIconColor = 'var(--color-foreground-icon-secondary)';

export const sidebarIconTertiaryColor = 'var(--color-foreground-icon-tertiary)';

export const selectedSidebarIconColor = 'var(--color-white)';

export function isNavigationGroup(value: unknown): value is DashboardNavigationGroup {
  return dashboardNavigationGroupOrder.some((group) => group === value);
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0]?.[0] ?? ''}${parts.at(-1)?.[0] ?? ''}` : name.slice(0, 2))
    .toLocaleUpperCase()
    .slice(0, 2);
}

export function Collapsible({
  children,
  className,
  collapsed,
}: {
  children: ReactNode;
  className?: string;
  collapsed: boolean;
}) {
  return (
    <span
      className={cn(
        'flex min-w-0 items-center overflow-hidden transition-[max-width,opacity,transform,filter] duration-[240ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none',
        collapsed
          ? 'max-w-0 translate-y-0.5 opacity-0 blur-[1px]'
          : 'max-w-44 translate-y-0 opacity-100 blur-0',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function isNavigationItemSelected(
  item: DashboardNavigationItem,
  locale: Locale,
  pathname: string,
) {
  const href = `/${locale}/${item.href}`;
  return item.available && (pathname === href || pathname.startsWith(`${href}/`));
}
