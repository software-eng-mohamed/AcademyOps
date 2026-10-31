'use client';

// Adapted from 7Ovr Notifications 2 (MIT-0): https://7ovr.com/r/notifications-2.json
// Keep the original compact layout; use shared Radix primitives, icons, and theme tokens.
import { Button, IconButton, Popover, PopoverContent, PopoverTrigger } from '@academyops/ui';
import { DocumentText, NotificationBing, NotificationStatus, TickCircle } from 'iconsax-react';
import { useId, useState } from 'react';
import type { DashboardOverviewCopy } from '@/i18n/dashboard-overview-copy';
import type { Locale } from '@/lib/locales';

type NotificationItem = {
  id: string;
  title: string;
  time: string;
  type: string;
};

export function NotificationsPopover({
  copy,
  locale,
  items,
  unreadCount,
  isPending,
  isError,
  isUpdating,
  hasMore,
  isLoadingMore,
  isLoadMoreError,
  onRead,
  onReadAll,
  onViewAll,
  onRetry,
}: {
  copy: DashboardOverviewCopy['notifications'];
  locale: Locale;
  items: NotificationItem[];
  unreadCount: number;
  isPending: boolean;
  isError: boolean;
  isUpdating: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  isLoadMoreError: boolean;
  onRead: (id: string) => void;
  onReadAll: () => void;
  onViewAll: () => void;
  onRetry: () => void;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const direction = locale === 'ar' ? 'rtl' : 'ltr';
  const count = new Intl.NumberFormat(locale, {
    numberingSystem: locale === 'ar' ? 'arab' : 'latn',
  }).format(unreadCount);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <IconButton
          className="relative size-12 rounded-xl border-border-button-default bg-background-primary-default text-text-secondary shadow-sm transition-shadow hover:bg-background-secondary-default hover:text-text-primary hover:shadow-md sm:size-13 dark:text-neutral-400"
          label={copy.ariaLabel}
        >
          <NotificationBing aria-hidden color="currentColor" size={24} variant="Linear" />
          {unreadCount > 0 ? (
            <span className="absolute -end-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-600 px-1 text-[10px] leading-none font-bold text-white ring-2 ring-background-primary-default">
              {unreadCount > 99 ? '99+' : count}
            </span>
          ) : null}
        </IconButton>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        aria-labelledby={titleId}
        className="w-[min(340px,calc(100vw-1.5rem))] overflow-hidden rounded-xl border-border-button-default bg-background-primary-default p-0 text-text-primary dark:[--color-text-secondary:var(--color-neutral-400)]"
        collisionPadding={12}
        data-notifications-block="7ovr-2"
        dir={direction}
        sideOffset={8}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm font-semibold tracking-tight" id={titleId}>
              {copy.title}
            </h2>
            {unreadCount > 0 ? (
              <span className="inline-flex h-5 items-center whitespace-nowrap rounded-full bg-accent-600 px-1.5 text-[10px] font-semibold text-white">
                {copy.newCount.replace('{count}', count)}
              </span>
            ) : null}
          </div>
          <Button
            className="min-h-7 shrink-0 rounded-md px-1.5 text-xs font-normal text-text-secondary hover:bg-background-secondary-default hover:text-text-primary"
            disabled={unreadCount === 0 || isUpdating}
            onClick={onReadAll}
            size="compact"
            variant="ghost"
          >
            {copy.markAllRead}
          </Button>
        </div>

        <div className="h-px bg-border-button-default" />

        <div
          aria-busy={isPending || isLoadingMore || isUpdating}
          className="plg-scrollbar max-h-[min(18rem,calc(100dvh-12rem))] overflow-y-auto overscroll-contain"
        >
          {isPending ? (
            <div aria-label={copy.loading} role="status">
              {[0, 1, 2].map((item) => (
                <div className="flex items-center gap-3 px-4 py-3" key={item}>
                  <span className="size-8 shrink-0 animate-pulse rounded-full bg-background-secondary-default motion-reduce:animate-none" />
                  <span className="flex flex-1 flex-col gap-2">
                    <span className="h-3 w-4/5 animate-pulse rounded bg-background-secondary-default motion-reduce:animate-none" />
                    <span className="h-2 w-1/3 animate-pulse rounded bg-background-secondary-default motion-reduce:animate-none" />
                  </span>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="px-4 py-6 text-center">
              <p className="text-xs leading-5 text-text-secondary" role="alert">
                {copy.error}
              </p>
              <Button className="mt-2" onClick={onRetry} size="compact" variant="ghost">
                {copy.retry}
              </Button>
            </div>
          ) : items.length ? (
            <ul className="flex flex-col">
              {items.map((item, index) => {
                const Icon = item.type.startsWith('REPORT_') ? DocumentText : NotificationStatus;
                return (
                  <li key={item.id}>
                    <button
                      className="group flex w-full items-start gap-3 bg-background-secondary-default/30 px-4 py-3 text-start transition-colors hover:bg-background-secondary-default/60 focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none"
                      disabled={isUpdating}
                      onClick={() => onRead(item.id)}
                      type="button"
                    >
                      <span aria-hidden className="relative mt-0.5 shrink-0">
                        <span className="grid size-8 place-items-center rounded-full border border-border-button-default bg-background-secondary-default text-text-secondary">
                          <Icon color="currentColor" size={18} variant="Bulk" />
                        </span>
                        <span className="absolute -end-1 -bottom-1 flex size-4 items-center justify-center rounded-md border border-border-button-default bg-background-primary-default text-accent-600 shadow-sm dark:text-accent-400">
                          <NotificationBing color="currentColor" size={10} variant="Linear" />
                        </span>
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="text-xs leading-snug font-medium text-text-primary">
                          {item.title}
                        </span>
                        <span className="text-[10px] text-text-secondary tabular-nums">
                          {item.time}
                        </span>
                      </span>
                      <span className="mt-1.5 flex size-4 shrink-0 items-center justify-center">
                        <span aria-hidden className="size-2 bg-accent-600 dark:bg-accent-400" />
                        <span className="sr-only">{copy.unreadIndicator}</span>
                      </span>
                    </button>
                    {index < items.length - 1 ? (
                      <div className="h-px bg-border-button-default" />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex flex-col items-center px-4 py-8 text-center" role="status">
              <TickCircle
                aria-hidden
                className="text-accent-600 dark:text-accent-400"
                color="currentColor"
                size={28}
                variant="Bulk"
              />
              <p className="mt-3 text-xs font-medium">{copy.emptyTitle}</p>
              <p className="mt-1 text-xs leading-5 text-text-secondary">{copy.emptyDescription}</p>
            </div>
          )}
        </div>

        <div className="h-px bg-border-button-default" />
        {isLoadMoreError ? (
          <p className="px-4 pt-2 text-xs text-text-secondary" role="alert">
            {copy.error}
          </p>
        ) : null}
        <div className="flex min-h-10 items-center justify-between gap-2 px-4 py-2.5">
          <span aria-live="polite" className="text-[10px] text-text-secondary">
            {isPending
              ? copy.loading
              : isError
                ? copy.error
                : unreadCount > 0
                  ? copy.unread.replace('{count}', count)
                  : copy.allRead}
          </span>
          {hasMore ? (
            <Button
              className="h-auto min-h-0 shrink-0 rounded-sm p-0 text-xs font-normal text-text-secondary hover:bg-transparent hover:text-text-primary hover:underline"
              disabled={isLoadingMore || isUpdating}
              onClick={onViewAll}
              size="compact"
              variant="ghost"
            >
              {isLoadingMore ? copy.loading : isLoadMoreError ? copy.retry : copy.viewAll}
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
