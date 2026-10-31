import { PlgMotionProvider } from '@academyops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getManagementLookup } from '@/api/management/lookups';
import { AcademyPage } from '@/features/academy/academy-page';
import { canRunManagementAction } from '@/features/management/action-access';
import { ManagementActionDialog } from '@/features/management/action-dialog';
import { actionFields, rowActions, validateManagementFields } from '@/features/management/actions';
import { ManagementDetail } from '@/features/management/detail-drawer';
import { ManagementPage } from '@/features/management/management-page';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { accountsUser } from './accounts-user.fixture';

vi.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
let client: QueryClient;
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const mount = (children: React.ReactNode) =>
  render(
    <QueryClientProvider client={client}>
      <PlgMotionProvider>{children}</PlgMotionProvider>
    </QueryClientProvider>,
  );
beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Accounts controls use the default permissions', () => {
  it.each(['students', 'enrollments', 'programs', 'cohorts', 'resources'] as const)(
    'keeps %s read-only',
    async (section) => {
      window.history.replaceState(null, '', `/en/${section}`);
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) =>
          json(
            url.includes('/auth/me')
              ? { branches: [{ id: 'main' }] }
              : { items: [], nextCursor: null },
          ),
        ),
      );
      mount(<AcademyPage section={section} user={accountsUser} />);
      await screen.findByRole('heading', { name: getAcademyCopy('en').noResults });
      expect(
        screen.queryByRole('button', {
          name: /Add student|New enrollment|New program|New cohort|Add room|Add new/,
        }),
      ).not.toBeInTheDocument();
    },
  );
  it.each(['payments', 'documents'] as const)('limits %s actions', async (section) => {
    window.history.replaceState(null, '', `/en/${section}`);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ items: [], nextCursor: null })),
    );
    mount(<ManagementPage section={section} user={accountsUser} />);
    await screen.findByRole('heading', { name: getAcademyCopy('en').noResults });
    expect(screen.queryByRole('button', { name: 'New invoice draft' })).not.toBeInTheDocument();
    if (section === 'payments')
      expect(screen.getByRole('button', { name: 'Record payment' })).toBeVisible();
    else expect(screen.getByRole('tab', { name: 'Receipts' })).toBeVisible();
  });
  it.each(['PENDING_VERIFICATION', 'POSTED'] as const)(
    'does not expose verification, refund or reversal actions for %s',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          json({ id: 'payment', status, version: 1, amount: '20.50', refunds: [] }),
        ),
      );
      mount(
        <ManagementDetail
          resource="payments"
          row={{ id: 'payment', name: 'Payment', code: '', status, version: 1, data: {} }}
          user={accountsUser}
          locale="en"
          onClose={vi.fn()}
          onAction={vi.fn()}
        />,
      );
      await screen.findByRole('heading', { name: 'Details' });
      expect(screen.queryByRole('heading', { name: 'Actions' })).not.toBeInTheDocument();
    },
  );
  it('does not offer a company directory lookup without company-read authority', () => {
    mount(
      <ManagementActionDialog
        target={{ action: 'recordPayment', resource: 'payments' }}
        userId={accountsUser.id}
        locale="en"
        canReadBusinessAccount={false}
        onClose={vi.fn()}
      />,
    );
    const select = screen.getByRole('button', { name: /Bill to/ });
    fireEvent.click(select);
    expect(screen.queryByRole('option', { name: 'Company' })).not.toBeInTheDocument();
    expect(
      screen
        .getAllByRole('option')
        .every((option) => !/Company|Business/.test(option.textContent ?? '')),
    ).toBe(true);
  });
  it('filters Paymob and inactive methods from manual recording', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json([
          { id: 'cash', code: 'CASH', name: 'Cash', isActive: true },
          { id: 'bank', code: 'BANK_TRANSFER', name: 'Bank', isActive: true },
          { id: 'gateway', code: 'PAYMOB', name: 'Paymob', isActive: true },
          { id: 'old', code: 'OLD', name: 'Old', isActive: false },
        ]),
      ),
    );
    const result = await getManagementLookup('paymentMethods', '', undefined, {});
    expect(result.items).toEqual([
      { value: 'cash', label: 'Cash', code: 'CASH' },
      { value: 'bank', label: 'Bank', code: 'BANK_TRANSFER' },
    ]);
  });
  it.each(['BANK_TRANSFER', 'INSTAPAY', 'VODAFONE_CASH'])(
    'requires a reference for %s before sending the request',
    (paymentMethodCode) => {
      const values = {
        accountType: 'STUDENT',
        studentId: 'student',
        enrollmentId: 'enrollment',
        methodId: 'method',
        amount: '25.50',
        receivedAt: '2026-09-06T12:00',
        paymentMethodCode,
      };
      expect(
        actionFields('recordPayment', values).find(({ name }) => name === 'externalReference')
          ?.required,
      ).toBe(true);
      expect(validateManagementFields('recordPayment', values).externalReference).toBe('required');
      expect(
        validateManagementFields('recordPayment', { ...values, externalReference: 'REF-1' }),
      ).toEqual({});
      expect(
        validateManagementFields('recordPayment', { ...values, paymentMethodCode: 'CASH' }),
      ).toEqual({});
    },
  );
  it('offers online checkout only for an unpaid installment with checkout authority', () => {
    const row = {
      id: 'installment',
      name: 'Installment',
      code: '',
      status: '',
      version: 0,
      data: { outstanding: '10.50' },
    };
    expect(rowActions('aging', row)).toEqual(['createCheckout']);
    expect(rowActions('aging', { ...row, data: { outstanding: '0.00' } })).toEqual([]);
    expect(canRunManagementAction(accountsUser, 'createCheckout', row)).toBe(true);
    expect(
      canRunManagementAction({ ...accountsUser, permissions: [] }, 'createCheckout', row),
    ).toBe(false);
  });
});
