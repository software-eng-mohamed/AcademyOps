import { PlgMotionProvider } from '@academyops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { managementRow } from '@/api/management/queries';
import { ManagementDetail } from '@/features/management/detail-drawer';
import { StudentAttendanceTools } from '@/features/student/student-attendance-tools';
import { StudentPage } from '@/features/student/student-page';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { managementText } from '@/i18n/management-copy';
import { studentText } from '@/i18n/student-copy';
import { studentUser } from './student-user.fixture';

vi.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
let client: QueryClient;
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const mount = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={client}>
      <PlgMotionProvider>{ui}</PlgMotionProvider>
    </QueryClientProvider>,
  );
beforeEach(() => {
  document.documentElement.lang = 'en';
  sessionStorage.clear();
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
  document.documentElement.lang = 'en';
});
describe('Student shared UI and self commands', () => {
  it('keeps the shared receipt drawer read-only and opens its payment in the student finance tab', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({
          id: 'receipt',
          serialNumber: '12',
          amount: '40.00',
          paymentId: 'payment',
          billingAccountId: 'private-billing-id',
          fiscalYear: 2026,
          issuedAt: '2026-09-01T10:00:00Z',
        }),
      ),
    );
    mount(
      <ManagementDetail
        resource="receipts"
        row={managementRow('receipts', { id: 'receipt' })}
        user={studentUser}
        locale="en"
        onClose={vi.fn()}
        onAction={vi.fn()}
      />,
    );
    expect(await screen.findByRole('link', { name: 'View payment' })).toHaveAttribute(
      'href',
      '/en/finance?tab=payments&record=payment',
    );
    expect(screen.queryByText('private-billing-id')).not.toBeInTheDocument();
  });
  it('offers the shared certificate download without administrative certificate actions', async () => {
    const request = vi.fn(async (url: string) =>
      json(
        url.includes('/download')
          ? { url: 'https://files.example.invalid/certificate.pdf' }
          : {
              id: 'certificate',
              serial: 'AO-2026-TEST',
              pdfStatus: 'AVAILABLE',
              validityStatus: 'ISSUED',
              version: 1,
            },
      ),
    );
    vi.stubGlobal('fetch', request);
    mount(
      <ManagementDetail
        resource="certificates"
        row={managementRow('certificates', { id: 'certificate' })}
        user={studentUser}
        locale="en"
        onClose={vi.fn()}
        onAction={vi.fn()}
      />,
    );
    const button = await screen.findByRole('button', { name: managementText('en', 'download') });
    expect(
      screen.queryByRole('button', { name: /Revoke|Collect|Upload|Reissue/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(button);
    await waitFor(() =>
      expect(
        document.querySelector('a[href="https://files.example.invalid/certificate.pdf"]'),
      ).not.toBeNull(),
    );
  });
  it.each(['learning', 'schedule', 'attendance', 'finance', 'certificates'] as const)(
    'mirrors the shared %s canvas and tabs in Arabic',
    async (section) => {
      document.documentElement.lang = 'ar';
      window.history.replaceState(null, '', `/ar/${section}`);
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => json({ items: [], nextCursor: null })),
      );
      mount(<StudentPage section={section} user={studentUser} />);
      await screen.findByRole('heading', { name: getAcademyCopy('ar').noResults });
      const tabs = screen.getByRole('tablist', { name: studentText('ar', section) });
      expect(tabs.closest('[dir]')).toHaveAttribute('dir', 'rtl');
      expect(
        screen
          .getByRole('heading', { name: studentText('ar', section), level: 1 })
          .closest('[dir]'),
      ).toHaveAttribute('dir', 'rtl');
    },
  );
  it.each(['learning', 'schedule', 'attendance', 'finance', 'certificates'] as const)(
    'renders %s with a labelled status control, no staff commands or branch selectors',
    async (section) => {
      window.history.replaceState(null, '', `/en/${section}`);
      const request = vi.fn(async () => json({ items: [], nextCursor: null }));
      vi.stubGlobal('fetch', request);
      mount(<StudentPage section={section} user={studentUser} />);
      await screen.findByRole('heading', { name: getAcademyCopy('en').noResults });
      expect(
        screen.getByRole('heading', { name: studentText('en', section), level: 1 }),
      ).toBeVisible();
      expect(
        screen.queryByRole('button', {
          name: /Add student|New enrollment|Issue certificate|New session|Record payment/,
        }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText('Branch')).not.toBeInTheDocument();
      expect(request.mock.calls).toHaveLength(1);
    },
  );
  it('rejects reversed date ranges before issuing requests', async () => {
    window.history.replaceState(null, '', '/en/schedule?from=2026-09-20&to=2026-09-01');
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    mount(<StudentPage section="schedule" user={studentUser} />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeVisible());
    expect(request).not.toHaveBeenCalled();
    expect(screen.getByLabelText('From date')).toHaveValue('2026-09-20');
  });
  it.each(['en', 'ar'] as const)(
    'keeps the private QR on demand and removes it when the %s dialog closes',
    async (locale) => {
      const request = vi.fn(async () => json({ token: 'student-private-qr-token' }));
      vi.stubGlobal('fetch', request);
      mount(<StudentAttendanceTools userId={studentUser.id} locale={locale} />);
      expect(request).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: studentText(locale, 'showQr') }));
      const dialog = screen.getByRole('dialog');
      expect(request).not.toHaveBeenCalled();
      fireEvent.click(within(dialog).getByRole('button', { name: studentText(locale, 'showQr') }));
      await waitFor(() =>
        expect(dialog.querySelector('svg title')).toHaveTextContent(studentText(locale, 'ownQr')),
      );
      fireEvent.click(within(dialog).getByRole('button', { name: getAcademyCopy(locale).close }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(request).toHaveBeenCalledTimes(1);
    },
  );
});
