import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardNotifications } from '@/features/dashboard/overview/dashboard-notifications';
import { getDashboardOverviewCopy } from '@/i18n/dashboard-overview-copy';
import type { Locale } from '@/lib/locales';

const clients: QueryClient[] = [];

function notification(id: number) {
  return {
    id: `notification-${id}`,
    type: `TEST_${id}`,
    createdAt: '2026-09-02T10:00:00.000Z',
    readAt: null,
    subjectType: null,
    subjectId: null,
    payload: null,
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function page(
  items: ReturnType<typeof notification>[],
  unreadCount = items.length,
  nextCursor: string | null = null,
) {
  return json({ items, unreadCount, nextCursor });
}

async function mount(locale: Locale = 'en') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const copy = {
    ...getDashboardOverviewCopy(locale).notifications,
    types: Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => [`TEST_${index + 1}`, `Update ${index + 1}`]),
    ),
  };
  render(
    <QueryClientProvider client={client}>
      <DashboardNotifications copy={copy} locale={locale} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: copy.ariaLabel }));
  return copy;
}

afterEach(() => {
  cleanup();
  for (const client of clients) client.clear();
  clients.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('7Ovr dashboard notifications', () => {
  it('previews four rows and loads the remaining cursor page from View all', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('cursor=')
        ? page([notification(7)], 7)
        : page([1, 2, 3, 4, 5, 6].map(notification), 7, 'notification-6'),
    );
    vi.stubGlobal('fetch', fetchMock);
    await mount();
    await screen.findByText('Update 1');
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'View all' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: 'View all' }));
    await screen.findByText('Update 7');
    expect(screen.getAllByRole('listitem')).toHaveLength(7);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/notifications?cursor=notification-6',
      expect.anything(),
    );
    expect(screen.queryByRole('button', { name: 'View all' })).not.toBeInTheDocument();
  });

  it('removes a read notification immediately, keeps the popover open, and updates the count', async () => {
    let serverItems = [notification(1), notification(2)];
    let finishRead: (response: Response) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        if (init.method === 'POST')
          return new Promise<Response>((resolve) => {
            finishRead = resolve;
          });
        return page(serverItems);
      }),
    );
    await mount();
    await screen.findByText('Update 1');
    fireEvent.click(screen.getByRole('button', { name: /Update 1/ }));
    await waitFor(() => expect(screen.queryByText('Update 1')).not.toBeInTheDocument());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('1 unread')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Update 2/ })).toBeDisabled();
    serverItems = [notification(2)];
    await act(async () => finishRead(new Response(null, { status: 204 })));
    await waitFor(() => expect(screen.getByRole('button', { name: /Update 2/ })).toBeEnabled());
  });

  it('restores the row and count if marking a notification read fails', async () => {
    let failRead: (response: Response) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        if (init.method === 'POST')
          return new Promise<Response>((resolve) => {
            failRead = resolve;
          });
        return page([notification(1)]);
      }),
    );
    await mount();
    await screen.findByText('Update 1');
    fireEvent.click(screen.getByRole('button', { name: /Update 1/ }));
    await waitFor(() => expect(screen.queryByText('Update 1')).not.toBeInTheDocument());
    await act(async () => failRead(json({ message: 'Failed' }, 500)));
    await waitFor(() => expect(screen.getByRole('button', { name: /Update 1/ })).toBeEnabled());
    expect(screen.getByText('1 unread')).toBeInTheDocument();
  });

  it.each([true, false])('clears all optimistically and handles success=%s', async (success) => {
    let serverItems = [notification(1), notification(2)];
    let finishClear: (response: Response) => void = () => {};
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === 'POST')
        return new Promise<Response>((resolve) => {
          finishClear = resolve;
        });
      return page(serverItems);
    });
    vi.stubGlobal('fetch', fetchMock);
    const copy = await mount();
    await screen.findByText('Update 1');
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    await screen.findByText(copy.emptyTitle);
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/notifications/read-all',
      expect.objectContaining({ method: 'POST' }),
    );
    if (success) serverItems = [];
    await act(async () =>
      finishClear(success ? new Response(null, { status: 204 }) : json({ message: 'Failed' }, 500)),
    );
    if (success) {
      expect(screen.getByText(copy.emptyTitle)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Clear all' })).toBeDisabled();
    } else {
      await screen.findByText('Update 1');
      expect(screen.getByText('2 unread')).toBeInTheDocument();
    }
  });

  it('sets Arabic direction on the portal and supports Escape to close', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => page([notification(1)])),
    );
    await mount('ar');
    await screen.findByText('Update 1');
    const dialog = screen.getByRole('dialog', { name: 'الإشعارات' });
    expect(dialog).toHaveAttribute('dir', 'rtl');
    expect(within(dialog).getByText('١ جديدة')).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'الإشعارات' })).toHaveFocus();
  });

  it('shows a retry action when loading fails', async () => {
    let failing = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => (failing ? json({ message: 'Failed' }, 500) : page([notification(1)]))),
    );
    await mount();
    const retry = await screen.findByRole('button', { name: 'Try again' });
    failing = false;
    fireEvent.click(retry);
    await screen.findByText('Update 1');
  });

  it('keeps the current rows when the next page fails and retries the cursor', async () => {
    let failing = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (!url.includes('cursor='))
          return page([1, 2, 3, 4].map(notification), 5, 'notification-4');
        return failing ? json({ message: 'Failed' }, 500) : page([notification(5)], 5);
      }),
    );
    await mount();
    await screen.findByText('Update 1');
    fireEvent.click(screen.getByRole('button', { name: 'View all' }));
    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    failing = false;
    fireEvent.click(retry);
    await screen.findByText('Update 5');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
