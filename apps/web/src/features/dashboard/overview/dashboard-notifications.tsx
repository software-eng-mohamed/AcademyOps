'use client';

import { useToast } from '@academyops/ui';
import { type InfiniteData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  getNotificationsControllerListV1QueryKey,
  type NotificationsControllerListV1QueryResult,
  notificationsControllerListV1,
  useNotificationsControllerMarkAllReadV1,
  useNotificationsControllerMarkReadV1,
} from '@/api/generated/workspace/workspace';
import { NotificationsPopover } from '@/components/blocks/notifications-2';
import type { DashboardOverviewCopy } from '@/i18n/dashboard-overview-copy';
import type { Locale } from '@/lib/locales';

type NotificationsCopy = DashboardOverviewCopy['notifications'];
type NotificationsData = InfiniteData<NotificationsControllerListV1QueryResult, string | null>;
type NotificationsMutationContext = { previous: NotificationsData | undefined };

const queryKey = [...getNotificationsControllerListV1QueryKey(), 'infinite'];
const previewLimit = 4;

function relativeTime(value: string, locale: Locale) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '';

  const seconds = Math.round((timestamp - Date.now()) / 1_000);
  const formatter = new Intl.RelativeTimeFormat(locale === 'ar' ? 'ar-EG' : 'en', {
    numeric: 'auto',
  });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, 'second');

  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');

  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');

  return formatter.format(Math.round(hours / 24), 'day');
}

export function DashboardNotifications({
  copy,
  locale,
}: {
  copy: NotificationsCopy;
  locale: Locale;
}) {
  const [showAll, setShowAll] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToast();
  const notifications = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      notificationsControllerListV1(pageParam ? { cursor: pageParam } : {}, { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.data.nextCursor,
    staleTime: 30_000,
  });

  const invalidateNotifications = () =>
    queryClient.invalidateQueries({ queryKey: getNotificationsControllerListV1QueryKey() });
  const restoreNotifications = (context: NotificationsMutationContext | undefined) => {
    if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
  };
  const showUpdateError = () =>
    toast.add({
      description: copy.updateErrorDescription,
      title: copy.updateErrorTitle,
      type: 'error',
    });
  const markAllRead = useNotificationsControllerMarkAllReadV1<
    unknown,
    NotificationsMutationContext
  >({
    mutation: {
      onError: (_error, _variables, context) => {
        restoreNotifications(context);
        showUpdateError();
      },
      onMutate: async () => {
        await queryClient.cancelQueries({ queryKey });
        const previous = queryClient.getQueryData<NotificationsData>(queryKey);
        queryClient.setQueryData<NotificationsData>(queryKey, (current) => {
          const firstPage = current?.pages[0];
          if (!firstPage) return current;
          return {
            pageParams: [null],
            pages: [
              {
                ...firstPage,
                data: { ...firstPage.data, items: [], nextCursor: null, unreadCount: 0 },
              },
            ],
          };
        });
        return { previous };
      },
      onSettled: invalidateNotifications,
      onSuccess: () => {
        setShowAll(false);
        toast.add({
          description: copy.markAllSuccessDescription,
          title: copy.markAllSuccessTitle,
          type: 'success',
        });
      },
    },
  });
  const markRead = useNotificationsControllerMarkReadV1<unknown, NotificationsMutationContext>({
    mutation: {
      onError: (_error, _variables, context) => {
        restoreNotifications(context);
        showUpdateError();
      },
      onMutate: async ({ id }) => {
        await queryClient.cancelQueries({ queryKey });
        const previous = queryClient.getQueryData<NotificationsData>(queryKey);
        queryClient.setQueryData<NotificationsData>(queryKey, (current) => {
          if (!current) return current;
          const wasRemoved = current.pages.some((page) =>
            page.data.items.some((item) => item.id === id),
          );
          return {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              data: {
                ...page.data,
                items: page.data.items.filter((item) => item.id !== id),
                unreadCount: Math.max(0, page.data.unreadCount - (wasRemoved ? 1 : 0)),
              },
            })),
          };
        });
        return { previous };
      },
      onSettled: invalidateNotifications,
    },
  });

  const items = notifications.data?.pages.flatMap((page) => page.data.items) ?? [];
  const visibleItems = showAll ? items : items.slice(0, previewLimit);
  const unreadCount = notifications.data?.pages[0]?.data.unreadCount ?? 0;

  return (
    <NotificationsPopover
      copy={copy}
      hasMore={(!showAll && items.length > previewLimit) || notifications.hasNextPage}
      isError={notifications.isError && !notifications.data}
      isLoadingMore={notifications.isFetchingNextPage}
      isLoadMoreError={notifications.isFetchNextPageError}
      isPending={notifications.isPending}
      isUpdating={markRead.isPending || markAllRead.isPending}
      items={visibleItems.map((item) => ({
        id: item.id,
        title: copy.types[item.type] ?? copy.fallback,
        time: relativeTime(item.createdAt, locale),
        type: item.type,
      }))}
      locale={locale}
      onRead={(id) => markRead.mutate({ id })}
      onReadAll={() => markAllRead.mutate()}
      onRetry={() => void notifications.refetch()}
      onViewAll={() => {
        setShowAll(true);
        if (
          (showAll || items.length <= previewLimit) &&
          notifications.hasNextPage &&
          !notifications.isFetching
        ) {
          void notifications.fetchNextPage();
        }
      }}
      unreadCount={unreadCount}
    />
  );
}
