import { PlgMotionProvider } from '@academyops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeFeeAction, type FeeAgreement, listFees, readFee } from '@/api/academy/pricing';
import { EnrollmentPricing } from '@/features/academy/enrollment-pricing';
import { PricingDialog } from '@/features/academy/pricing-dialog';
import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { operationsUser } from './operations-user.fixture';
import { receptionUser } from './reception-user.fixture';

vi.mock('@/api/academy/pricing', async (original) => ({
  ...(await original<typeof import('@/api/academy/pricing')>()),
  listFees: vi.fn(),
  readFee: vi.fn(),
  executeFeeAction: vi.fn(async () => ({ id: 'fee-1' })),
}));
const owner: DashboardUser = {
  id: 'owner',
  name: 'Owner',
  branches: [],
  organization: { name: 'Academy' },
  roles: [{ code: 'OWNER', name: 'Owner' }],
  permissions: [
    { code: 'pricing.read', scopes: ['O'] },
    { code: 'pricing.propose', scopes: ['O'] },
    { code: 'discounts.approve_tier1', scopes: ['O'] },
  ],
};
const fee: FeeAgreement = {
  id: 'fee-1',
  status: 'DRAFT',
  version: 1,
  lockVersion: 1,
  subtotal: '100.00',
  totalAmount: '100.00',
  discountAmount: '0.00',
  requiredApprovalTier: 1,
  currencyCode: 'EGP',
  enrollmentId: 'e',
  proposedBy: 'owner',
  approvedBy: null,
  approvedAt: null,
  schedules: [],
  lines: [
    {
      id: 'l',
      type: 'TUITION',
      descriptionAr: 'رسوم الكورس',
      descriptionEn: 'Course fees',
      quantity: '1.00',
      unitAmount: '100.00',
      lineAmount: '100.00',
      organizationId: 'o',
      pricingAgreementId: 'fee-1',
      createdAt: '',
    },
  ],
};
let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(listFees).mockResolvedValue({ items: [fee], nextCursor: null });
  vi.mocked(readFee).mockResolvedValue(fee);
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
const wrap = (children: React.ReactNode) => (
  <QueryClientProvider client={client}>
    <PlgMotionProvider>{children}</PlgMotionProvider>
  </QueryClientProvider>
);

describe('Owner enrollment fees', () => {
  it('lets Reception propose and edit fees with B scope without approving discounts', async () => {
    render(
      wrap(<EnrollmentPricing enrollmentId="e" state="DRAFT" user={receptionUser} locale="en" />),
    );
    expect(screen.getByRole('button', { name: 'New fee agreement' })).toBeInTheDocument();
    expect(screen.getByText(/Approval is handled by an authorized reviewer/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Agreement 1 · Draft' }));
    expect(await screen.findByRole('button', { name: 'Edit fee agreement' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit for approval' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve agreement' })).not.toBeInTheDocument();
  });
  it('keeps Reception approval buttons absent on proposed fees', async () => {
    vi.mocked(readFee).mockResolvedValue({ ...fee, status: 'PROPOSED' });
    render(
      wrap(
        <EnrollmentPricing
          enrollmentId="e"
          state="PENDING_APPROVAL"
          user={receptionUser}
          locale="en"
        />,
      ),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Agreement 1 · Draft' }));
    await screen.findByRole('table', { name: 'Fee items' });
    expect(screen.queryByRole('button', { name: 'Approve agreement' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject agreement' })).not.toBeInTheDocument();
  });
  it('lets Reception draft installments for approved fees but not approve the schedule', async () => {
    vi.mocked(readFee).mockResolvedValue({
      ...fee,
      status: 'APPROVED',
      schedules: [
        {
          id: 'schedule-1',
          organizationId: 'o',
          createdAt: '',
          updatedAt: '',
          status: 'DRAFT',
          version: 1,
          lockVersion: 1,
          enrollmentId: 'e',
          pricingAgreementId: fee.id,
          approvedBy: null,
          approvedAt: null,
          installments: [],
        },
      ],
    });
    render(
      wrap(<EnrollmentPricing enrollmentId="e" state="ACTIVE" user={receptionUser} locale="en" />),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Agreement 1 · Draft' }));
    expect(await screen.findByRole('button', { name: 'New installment schedule' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Edit installment schedule' })).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Approve installment schedule' }),
    ).not.toBeInTheDocument();
  });
  it('lets Operations inspect fees without offering finance mutations', async () => {
    render(
      wrap(<EnrollmentPricing enrollmentId="e" state="DRAFT" user={operationsUser} locale="en" />),
    );
    expect(screen.getByText(/Changes are handled by the finance team/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Agreement 1 · Draft' }));
    expect(await screen.findByRole('table', { name: 'Fee items' })).toBeInTheDocument();
    for (const name of [
      'New fee agreement',
      'Edit fee agreement',
      'Submit for approval',
      'Approve agreement',
      'New installment schedule',
    ])
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  });
  it('loads only the selected agreement and exposes state-appropriate controls', async () => {
    render(wrap(<EnrollmentPricing enrollmentId="e" state="DRAFT" user={owner} locale="en" />));
    fireEvent.click(await screen.findByRole('button', { name: 'Agreement 1 · Draft' }));
    expect(await screen.findByRole('table', { name: 'Fee items' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit fee agreement' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Approve agreement' })).not.toBeInTheDocument();
    expect(listFees).toHaveBeenCalledWith('e', undefined, expect.any(AbortSignal));
    expect(readFee).toHaveBeenCalledTimes(1);
  });
  it('does not show tier 2 approval to a tier 1 approver', async () => {
    vi.mocked(readFee).mockResolvedValue({ ...fee, status: 'PROPOSED', requiredApprovalTier: 2 });
    render(wrap(<EnrollmentPricing enrollmentId="e" state="ACTIVE" user={owner} locale="en" />));
    expect(screen.queryByRole('button', { name: 'New fee agreement' })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Agreement 1 · Draft' }));
    expect(await screen.findByRole('button', { name: 'Reject agreement' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Approve agreement' })).not.toBeInTheDocument();
  });
  it('blocks incomplete fees then saves without losing enrollment context', async () => {
    const close = vi.fn();
    render(
      wrap(
        <PricingDialog
          target={{ action: 'create' }}
          enrollmentId="e"
          userId="owner"
          locale="en"
          onClose={close}
          onCreated={vi.fn()}
        />,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(executeFeeAction).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: /Description/ }), {
      target: { value: 'Course fees' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /Unit amount/ }), {
      target: { value: '100' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(executeFeeAction).toHaveBeenCalledWith(
      { action: 'create' },
      'e',
      expect.objectContaining({ discount: '0' }),
      expect.any(String),
    );
  });
  it('renders Arabic installment controls and blocks a mismatched total', () => {
    render(
      wrap(
        <PricingDialog
          target={{ action: 'createSchedule', agreement: fee }}
          enrollmentId="e"
          userId="owner"
          locale="ar"
          onClose={vi.fn()}
          onCreated={vi.fn()}
        />,
      ),
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('dir', 'rtl');
    fireEvent.click(screen.getByRole('button', { name: 'إضافة قسط' }));
    expect(screen.getAllByLabelText(/تاريخ الاستحقاق/)).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));
    expect(executeFeeAction).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
