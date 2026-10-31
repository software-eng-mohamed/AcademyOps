'use client';

import { cn, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@academyops/ui';
import { Buildings, Global, LogoutCurve } from 'iconsax-react';

import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { getPrimaryRoleCode } from '@/features/dashboard/navigation';

import { getAppCopy } from '@/i18n/app-copy';
import type { Locale } from '@/lib/locales';
import { Collapsible, initials, sidebarIconColor } from './sidebar-parts';
export function AccountMenu({
  collapsed,
  locale,
  logoutPending,
  mobile,
  onLanguageSwitch,
  onLogout,
  user,
}: {
  collapsed: boolean;
  locale: Locale;
  logoutPending: boolean;
  mobile: boolean;
  onLanguageSwitch: () => void;
  onLogout: () => void;
  user: DashboardUser;
}) {
  const copy = getAppCopy(locale).shell;
  const roleCode = getPrimaryRoleCode(user);
  const roleLabel = roleCode ? copy.roleLabels[roleCode] : copy.noRole;

  return (
    <Menu>
      <MenuTrigger>
        <button
          aria-label={copy.accountMenu}
          className={cn(
            'group/account relative flex min-w-0 cursor-pointer items-center gap-2 rounded-xl p-1 outline-none',
            'transition-[background-color,transform] duration-150 ease-out hover:scale-[1.012] hover:bg-background-tertiary-default active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none',
            'focus-visible:ring-2 focus-visible:ring-border-focus-ring focus-visible:ring-offset-1',
            collapsed ? 'w-9 justify-center gap-0 rounded-full p-0' : 'flex-1 pe-2',
          )}
          type="button"
        >
          <span className="relative grid size-8 shrink-0 place-items-center rounded-full bg-linear-to-b from-accent-500 to-accent-600 text-[11px] font-bold text-white shadow-nav-selected transition-[box-shadow] duration-150 group-hover/account:shadow-[0_4px_14px_rgb(37_99_235_/_0.28)] motion-reduce:transition-none">
            {initials(user.name)}
            <span
              aria-hidden
              className="absolute bottom-0 end-0 size-2.5 rounded-full border-2 border-background-secondary-default bg-success"
            />
          </span>
          <Collapsible className="flex-1" collapsed={collapsed}>
            <span className="flex min-w-0 flex-1 items-center justify-between gap-1.5">
              <span className="flex min-w-0 flex-col items-start">
                <span className="max-w-32 truncate text-body-semibold whitespace-nowrap text-text-primary">
                  {user.name}
                </span>
                <span className="max-w-32 truncate text-[10px] leading-4 whitespace-nowrap text-text-tertiary">
                  {roleLabel}
                </span>
              </span>
            </span>
          </Collapsible>
        </button>
      </MenuTrigger>
      <MenuContent
        align="start"
        className="sidebar-account-menu w-[288px] rounded-2xl border-border-sidebar-profile-hover bg-background-secondary-default p-2 shadow-[var(--shadow-dropdown)]"
        side={mobile ? 'bottom' : locale === 'ar' ? 'left' : 'right'}
        sideOffset={mobile ? 10 : collapsed ? 12 : 60}
      >
        <div className="rounded-xl bg-background-tertiary-default p-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-linear-to-b from-accent-500 to-accent-600 text-xs font-bold text-white shadow-nav-selected">
              {initials(user.name)}
              <span
                aria-hidden
                className="absolute bottom-0 end-0 size-3 rounded-full border-2 border-background-tertiary-default bg-success"
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-semibold text-text-primary">{user.name}</p>
              <p className="truncate text-body-regular text-text-secondary">{roleLabel}</p>
            </div>
          </div>
          <div className="mt-3 flex min-w-0 items-center gap-2 border-t border-border-button-default pt-2.5">
            <Buildings aria-hidden color={sidebarIconColor} size={18} variant="Bulk" />
            <span className="truncate text-body-medium text-text-secondary">
              {user.organization.name}
            </span>
          </div>
        </div>
        <MenuSeparator className="my-2 h-px bg-border-button-default" />
        <MenuItem
          className="min-h-10 cursor-pointer rounded-xl px-2.5 text-body-medium text-text-primary data-[highlighted]:bg-background-tertiary-default"
          onSelect={onLanguageSwitch}
        >
          <Global aria-hidden color={sidebarIconColor} size={20} variant="Bulk" />
          <span className="flex-1">{copy.language}</span>
        </MenuItem>
        <MenuSeparator className="my-2 h-px bg-border-button-default" />
        <MenuItem
          className="min-h-10 cursor-pointer rounded-xl px-2.5 text-body-medium text-danger data-[highlighted]:bg-danger-soft data-[highlighted]:text-danger"
          disabled={logoutPending}
          onSelect={onLogout}
        >
          <LogoutCurve aria-hidden color="var(--plg-color-danger)" size={20} variant="Bulk" />
          {logoutPending ? copy.loggingOut : copy.logout}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
