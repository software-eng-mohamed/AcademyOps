import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiQueryClient } from '@/api/query/client';
import { SalesOverview } from '@/features/dashboard/overview/sales-overview';
import { getSalesOverviewCopy } from '@/i18n/sales-overview-copy';
import { salesOverviewFixture } from './sales-overview.fixture';

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
  initialOverview: ReturnType<typeof salesOverviewFixture> | null = salesOverviewFixture(),
) {
  const client = createApiQueryClient();
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retryDelay: 0 } });
  clients.push(client);
  const view = render(
    <QueryClientProvider client={client}>
      <SalesOverview initialOverview={initialOverview} userId="sales-a" userName="Samir Ahmed" />
    </QueryClientProvider>,
  );
  return { client, ...view };
}
function failure(status: number) {
  return new Response(
    JSON.stringify({
      code: status === 403 ? 'PERMISSION_DENIED' : 'SERVICE_UNAVAILABLE',
      messageKey: 'request.failed',
      fieldErrors: [],
    }),
    { status, headers: { 'content-type': 'application/json' } },
  );
}
afterEach(() => {
  cleanup();
  for (const client of clients) client.clear();
  clients.length = 0;
  route.pathname = '/en/dashboard';
  vi.unstubAllGlobals();
});

describe('Sales overview', () => {
  it('uses server data immediately, three BoardUI cards and real follow-ups without a duplicate request', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    mount();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Good to see you, Samir.');
    expect(screen.getByText('Open leads')).toBeInTheDocument();
    expect(screen.getByText('New this month')).toBeInTheDocument();
    expect(screen.getByText('Converted this month')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Open leads', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Cairo time')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Amira')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Amira' })).toHaveAttribute(
      'href',
      `/en/leads?record=${salesOverviewFixture().followUps.items[0]?.id}`,
    );
    expect(screen.getByText('Unnamed lead')).toBeInTheDocument();
    expect(screen.getByText('No stage assigned')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('localizes the full view and uses RTL with Cairo dates', () => {
    route.pathname = '/ar/dashboard';
    const { container } = mount();
    const copy = getSalesOverviewCopy('ar');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('أهلًا بيك يا Samir');
    expect(screen.getByText(copy.followUps.unnamed)).toBeInTheDocument();
    expect(screen.getByText(copy.metrics.open)).toBeInTheDocument();
    expect(container.querySelector('[data-overview-role]')).toHaveAttribute('dir', 'rtl');
    expect(container.querySelector('time')).toHaveAttribute('datetime', '2026-09-02T07:00:00Z');
    expect(container.querySelector('h1 bdi')).toHaveTextContent('Samir');
    expect(screen.getByText(copy.followUps.timezone)).toBeInTheDocument();
  });

  it('shows an honest empty state and does not insert demonstration numbers', () => {
    const fixture = salesOverviewFixture();
    fixture.metrics = {
      openLeads: 0,
      newLeadsThisMonth: 0,
      convertedLeadsThisMonth: 0,
      followUpsToday: 0,
      overdueFollowUps: 0,
    };
    fixture.followUps = { total: 0, items: [] };
    mount(fixture);
    expect(screen.getByText(getSalesOverviewCopy('en').followUps.emptyTitle)).toBeInTheDocument();
    expect(screen.getAllByText('0')).toHaveLength(3);
    expect(
      screen.getByText(getSalesOverviewCopy('en').followUps.emptyFootnote),
    ).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('keeps the follow-up preview and total distinct without inventing trends', () => {
    const fixture = salesOverviewFixture();
    fixture.followUps.total = 23;
    mount(fixture);
    expect(screen.getByText('Showing 2 of 23 due follow-ups')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(getSalesOverviewCopy('en').followUps.emptyTitle),
    ).not.toBeInTheDocument();
  });

  it('retries a transient failure only once and exposes a working retry button', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(failure(503)));
    vi.stubGlobal('fetch', fetch);
    mount(null);
    expect(screen.queryByText('Open leads')).not.toBeInTheDocument();
    await screen.findByRole('alert');
    expect(fetch).toHaveBeenCalledTimes(2);
    fetch.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(salesOverviewFixture()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Amira');
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/v1/dashboard/sales',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('hides cached lead data immediately when access is revoked and does not retry 403', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(failure(403)));
    vi.stubGlobal('fetch', fetch);
    const { client } = mount();
    expect(screen.getByText('Amira')).toBeInTheDocument();
    await act(async () => {
      await client.refetchQueries({ queryKey: ['/api/v1/dashboard/sales', 'sales-a'] });
    });
    await screen.findByText(getSalesOverviewCopy('en').forbidden);
    expect(screen.queryByText('Amira')).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps last loaded data explicitly marked after a transient refresh failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(failure(503))),
    );
    const { client } = mount();
    await act(async () => {
      await client.refetchQueries({ queryKey: ['/api/v1/dashboard/sales', 'sales-a'] });
    });
    await screen.findByText(getSalesOverviewCopy('en').stale);
    expect(screen.getByText('Amira')).toBeInTheDocument();
  });

  it('does not reuse another employee’s query cache', async () => {
    const { client, rerender } = mount();
    const other = salesOverviewFixture();
    other.followUps.items = other.followUps.items
      .slice(0, 1)
      .map((item) => ({ ...item, name: 'Other employee lead' }));
    rerender(
      <QueryClientProvider client={client}>
        <SalesOverview initialOverview={other} userId="sales-b" userName="Mona" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText('Other employee lead')).toBeInTheDocument());
    expect(screen.queryByText('Amira')).not.toBeInTheDocument();
  });
});
