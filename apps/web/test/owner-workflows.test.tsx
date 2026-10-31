import { PlgApiError } from '@academyops/api-client/http';
import { PlgMotionProvider } from '@academyops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAcademyContext } from '@/api/academy/queries';
import { executeManagementAction } from '@/api/management/commands';
import { replaceBusinessContacts } from '@/api/management/contacts';
import { getManagementPage, managementRow } from '@/api/management/queries';
import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { ManagementActionDialog } from '@/features/management/action-dialog';
import { ContactsDialog } from '@/features/management/contacts-dialog';
import { ManagementDetail } from '@/features/management/detail-drawer';
import { ManagementPage } from '@/features/management/management-page';
import { ManagementValue } from '@/features/management/presentation';

vi.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock('@/api/academy/queries', async (original) => ({
  ...(await original<typeof import('@/api/academy/queries')>()),
  getAcademyContext: vi.fn(async () => ({ branches: [{ id: 'academy-branch', name: 'Academy' }] })),
}));
vi.mock('@/api/management/commands', async (original) => ({
  ...(await original<typeof import('@/api/management/commands')>()),
  executeManagementAction: vi.fn(async () => ({})),
}));
vi.mock('@/api/management/contacts', async (original) => ({
  ...(await original<typeof import('@/api/management/contacts')>()),
  replaceBusinessContacts: vi.fn(async () => ({})),
}));
vi.mock('@/api/management/queries', async (original) => ({
  ...(await original<typeof import('@/api/management/queries')>()),
  getManagementPage: vi.fn(async () => ({ items: [], nextCursor: null })),
}));

let client: QueryClient;
const owner: DashboardUser = {
  id: 'owner',
  name: 'Owner',
  branches: [],
  organization: { name: 'Academy' },
  roles: [{ code: 'OWNER', name: 'Owner' }],
  permissions: [{ code: 'academic.catalog.read', scopes: ['O'] }],
};
beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  window.history.replaceState(null, '', '/en/sessions');
  for (const name of ['ResizeObserver', 'IntersectionObserver'])
    vi.stubGlobal(
      name,
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  vi.stubGlobal(
    'matchMedia',
    vi
      .fn()
      .mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});
function wrap(children: React.ReactNode) {
  return (
    <QueryClientProvider client={client}>
      <PlgMotionProvider>{children}</PlgMotionProvider>
    </QueryClientProvider>
  );
}

describe('Owner workflow regressions', () => {
  it('shows no overdue days for future installments while preserving actual overdue ages', () => {
    const view = render(<ManagementValue data={{ ageDays: -7 }} name="ageDays" locale="en" />);
    expect(screen.getByText('0')).toBeVisible();
    expect(screen.queryByText('-7')).not.toBeInTheDocument();
    view.rerender(<ManagementValue data={{ ageDays: 10 }} name="ageDays" locale="en" />);
    expect(screen.getByText('10')).toBeVisible();
  });
  it('closes a stale page security prompt after another dialog refreshes the authenticated query', async () => {
    window.history.replaceState(null, '', '/en/reports');
    vi.mocked(getManagementPage).mockRejectedValueOnce(
      new PlgApiError(403, { code: 'MFA_STEP_UP_REQUIRED', messageKey: 'auth.stepUpRequired' }),
    );
    render(wrap(<ManagementPage section="reports" user={owner} />));
    expect(await screen.findByRole('dialog', { name: 'Confirm it is you' })).toBeInTheDocument();
    await act(async () => {
      await client.invalidateQueries();
    });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Confirm it is you' })).not.toBeInTheDocument(),
    );
  });
  it('updates an open export drawer from queued to downloadable using the refreshed row', () => {
    const row = (status: string) =>
      managementRow('exports', {
        id: 'report-1',
        reportType: 'FINANCE_RECEIVABLES',
        status,
        expiresAt: '2050-01-01T00:00:00.000Z',
      });
    const tree = (status: string) =>
      wrap(
        <ManagementDetail
          resource="exports"
          row={row(status)}
          user={owner}
          locale="en"
          onClose={vi.fn()}
          onAction={vi.fn()}
        />,
      );
    const view = render(tree('QUEUED'));
    expect(screen.queryByRole('button', { name: 'Download file' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Queued').length).toBeGreaterThan(0);
    view.rerender(tree('AVAILABLE'));
    expect(screen.getByRole('button', { name: 'Download file' })).toBeEnabled();
    expect(screen.queryByText('Loading your academy…')).not.toBeInTheDocument();
  });
  it('uses the academy context automatically without asking the Owner to choose a branch', async () => {
    const close = vi.fn();
    render(
      wrap(
        <ManagementActionDialog
          target={{ action: 'createAccount', resource: 'businessAccounts' }}
          userId="owner"
          locale="en"
          onClose={close}
        />,
      ),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled());
    expect(getAcademyContext).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /branch/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /branch/i })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: /Legal name/ }), {
      target: { value: 'Course sponsor' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /Display name/ }), {
      target: { value: 'Sponsor' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(executeManagementAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'createAccount' }),
      expect.objectContaining({ legalName: 'Course sponsor' }),
      expect.any(String),
      'academy-branch',
    );
  });
  it('adds/removes invoice lines and keeps each charge lookup uniquely labeled', () => {
    render(
      wrap(
        <ManagementActionDialog
          target={{ action: 'createInvoice', resource: 'invoices' }}
          userId="owner"
          locale="en"
          onClose={vi.fn()}
        />,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add invoice line' }));
    const lookups = screen
      .getAllByRole('combobox')
      .filter((element) => element.id.endsWith('-entry'));
    expect(lookups).toHaveLength(2);
    expect(new Set(lookups.map((element) => element.id)).size).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: 'Remove line 2' }));
    expect(screen.getByRole('button', { name: 'Remove line 1' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(executeManagementAction).not.toHaveBeenCalled();
  });
  it('saves only one primary contact and excludes client-only labels', async () => {
    const row = managementRow('businessAccounts', {
      id: 'company',
      version: 3,
      owningBranchId: 'academy-branch',
      contacts: [
        { personId: 'one', person: { name: 'First contact' }, role: 'Manager', isPrimary: true },
        {
          personId: 'two',
          person: { name: 'Second contact' },
          role: 'Coordinator',
          isPrimary: false,
        },
      ],
    });
    render(wrap(<ContactsDialog row={row} userId="owner" locale="en" onClose={vi.fn()} />));
    const boxes = screen.getAllByRole('checkbox');
    const second = boxes[1];
    if (!second) throw new Error('Expected a second contact');
    fireEvent.click(second);
    expect(boxes[0]).not.toBeChecked();
    expect(boxes[1]).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(replaceBusinessContacts).toHaveBeenCalledWith(
        'company',
        3,
        [
          { personId: 'one', role: 'Manager', isPrimary: false },
          { personId: 'two', role: 'Coordinator', isPrimary: true },
        ],
        expect.any(String),
      ),
    );
  });
  it('restores date fields and previous-page navigation from the URL after remount', async () => {
    window.history.replaceState(
      null,
      '',
      '/en/sessions?page=2&cursor=second&trail=_&from=2026-08-01&to=2026-08-31',
    );
    const tree = () => wrap(<ManagementPage section="sessions" user={owner} />);
    const view = render(tree());
    await screen.findByRole('heading', { name: 'No records found' });
    expect(screen.getByLabelText(/^From date/)).toHaveValue('2026-08-01');
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(new URLSearchParams(window.location.search).get('cursor')).toBeNull();
    view.rerender(tree());
    window.history.replaceState(null, '', '/en/sessions?from=2026-09-01&to=2026-09-05');
    view.rerender(tree());
    expect(screen.getByLabelText(/^From date/)).toHaveValue('2026-09-01');
    expect(getManagementPage).toHaveBeenCalled();
  });
});
