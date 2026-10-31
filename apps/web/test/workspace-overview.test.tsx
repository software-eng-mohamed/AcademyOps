import type { WorkspaceOverviewRole } from '@academyops/api-client/workspace-overview';
import { workspaceOverviewRoles } from '@academyops/api-client/workspace-overview';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiQueryClient } from '@/api/query/client';
import { WorkspaceOverviewPage } from '@/features/dashboard/overview/workspace-overview';
import { getWorkspaceOverviewCopy } from '@/i18n/workspace-overview-copy';
import { workspaceFixture } from './workspace-overview.fixture';

const route = vi.hoisted(() => ({ pathname: '/en/dashboard' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));
vi.mock('@/features/dashboard/overview/dashboard-breadcrumbs', () => ({
  DashboardBreadcrumbs: () => <nav aria-label="Breadcrumb" />,
}));
vi.mock('@/features/dashboard/overview/dashboard-notifications', () => ({
  DashboardNotifications: () => <button type="button">Notifications</button>,
}));
const clients: ReturnType<typeof createApiQueryClient>[] = [];
function mount(
  role: WorkspaceOverviewRole,
  initial: ReturnType<typeof workspaceFixture> | null = workspaceFixture(role),
  userId = 'user-a',
) {
  const client = createApiQueryClient();
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retryDelay: 0 } });
  clients.push(client);
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <WorkspaceOverviewPage
          role={role}
          initialOverview={initial}
          userId={userId}
          userName="Samir Ahmed"
        />
      </QueryClientProvider>,
    ),
  };
}
function response(
  status: number,
  data: unknown = { code: status === 403 ? 'PERMISSION_DENIED' : 'SERVICE_UNAVAILABLE' },
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
afterEach(() => {
  cleanup();
  for (const client of clients) client.clear();
  clients.length = 0;
  vi.unstubAllGlobals();
  route.pathname = '/en/dashboard';
});
describe('Role workspace views', () => {
  it.each(
    workspaceOverviewRoles.flatMap((role) =>
      (['ar', 'en'] as const).map((locale) => ({ role, locale })),
    ),
  )(
    'renders $role in $locale immediately with the shared welcome and cards',
    ({ role, locale }) => {
      route.pathname = `/${locale}/dashboard`;
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      const { container } = mount(role);
      const copy = getWorkspaceOverviewCopy(locale);
      expect(screen.getByText(copy.roles[role].title)).toBeInTheDocument();
      expect(container.querySelector('h1 bdi')).toHaveTextContent('Samir');
      expect(container.querySelector('[data-overview-role]')).toHaveAttribute(
        'dir',
        locale === 'ar' ? 'rtl' : 'ltr',
      );
      expect(container.querySelectorAll('[data-dashboard-icon-tone]')).toHaveLength(3);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(fetch).not.toHaveBeenCalled();
      if (role !== 'OTP_OPERATOR')
        expect(
          screen.getByText(
            copy.preview
              .replace('{shown}', locale === 'ar' ? '١' : '1')
              .replace('{total}', locale === 'ar' ? '٨' : '8'),
          ),
        ).toBeInTheDocument();
    },
  );
  it('renders real zeroes, a truthful empty queue and no demo content', () => {
    const initial = workspaceFixture('STUDENT');
    initial.metrics.forEach((item) => {
      item.value = 0;
    });
    initial.queue = { kind: 'UPCOMING', total: 0, items: [] };
    mount('STUDENT', initial);
    expect(screen.getAllByText('0')).toHaveLength(3);
    expect(
      screen.getByText(getWorkspaceOverviewCopy('en').queues.UPCOMING.empty),
    ).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });
  it('keeps payment cents and does not invent financial totals', () => {
    mount('ACCOUNTS');
    expect(screen.getByText(/125\.50/)).toBeInTheDocument();
    expect(screen.queryByText(/revenue/i)).not.toBeInTheDocument();
  });
  it('renders pairing readiness without QR secrets or fake counters', () => {
    const initial = workspaceFixture('OTP_OPERATOR');
    if (!initial.channel) throw new Error('Missing channel fixture');
    initial.channel = {
      ...initial.channel,
      state: 'QR_REQUIRED',
      needsQr: true,
      otpAvailable: false,
    };
    const { container } = mount('OTP_OPERATOR', initial);
    expect(container.querySelectorAll('[data-value-kind="status"]')).toHaveLength(3);
    expect(screen.getByText('Pairing needed')).toBeInTheDocument();
    expect(screen.getByText('Not ready')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });
  it('retries a transient error once and recovers using the retry button', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(response(503)));
    vi.stubGlobal('fetch', fetch);
    mount('ACADEMIC', null);
    await screen.findByRole('alert');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Active groups')).not.toBeInTheDocument();
    fetch.mockImplementation(() => Promise.resolve(response(200, workspaceFixture('ACADEMIC'))));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Active groups');
  });
  it('drops visible cached data on permission loss without retrying 403', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(response(403)));
    vi.stubGlobal('fetch', fetch);
    const { client } = mount('TRAINER');
    await act(async () => {
      await client.invalidateQueries();
    });
    await screen.findByRole('alert');
    expect(screen.queryByText('Group A')).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('keeps last loaded data explicit on refresh failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(response(503))),
    );
    const { client } = mount('RECEPTION');
    await act(async () => {
      await client.invalidateQueries();
    });
    await screen.findByText(getWorkspaceOverviewCopy('en').stale);
    expect(screen.getByText('Group A')).toBeInTheDocument();
  });
  it('includes the user and role in query cache keys', async () => {
    const { client } = mount('STUDENT', workspaceFixture('STUDENT'), 'student-a');
    await waitFor(() => expect(client.getQueryCache().getAll()).toHaveLength(1));
    expect(client.getQueryCache().getAll()[0]?.queryKey).toEqual(
      expect.arrayContaining(['student-a']),
    );
    expect(JSON.stringify(client.getQueryCache().getAll()[0]?.queryKey)).toContain('STUDENT');
  });
});
