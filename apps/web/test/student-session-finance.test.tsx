import { PlgMotionProvider } from '@academyops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_EXPIRED_EVENT } from '@/api/browser/auth-events';
import { getWorkspaceOverviewControllerOverviewV1QueryKey } from '@/api/generated/dashboard/dashboard';
import {
  checkInStudent,
  createStudentCheckout,
  getStudentPage,
  getStudentQr,
} from '@/api/student/queries';
import { StudentAttendanceTools } from '@/features/student/student-attendance-tools';
import { StudentFinance } from '@/features/student/student-finance';
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
  it('validates a session code locally and prevents repeat submission after success', async () => {
    const request = vi.fn(async () => json({ id: 'record', status: 'PRESENT', version: 1 }, 201));
    vi.stubGlobal('fetch', request);
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    mount(<StudentAttendanceTools userId={studentUser.id} locale="en" />);
    fireEvent.click(screen.getByRole('button', { name: studentText('en', 'checkIn') }));
    const dialog = screen.getByRole('dialog');
    const submit = within(dialog).getByRole('button', { name: studentText('en', 'checkIn') });
    fireEvent.click(submit);
    expect(screen.getByRole('alert')).toHaveTextContent(studentText('en', 'invalidToken'));
    expect(request).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(studentText('en', 'sessionToken')), {
      target: { value: 'a-valid-synthetic-session-challenge' },
    });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await screen.findByText(studentText('en', 'checkedIn'));
    expect(request).toHaveBeenCalledTimes(1);
    expect(submit).toBeDisabled();
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: [...getWorkspaceOverviewControllerOverviewV1QueryKey('STUDENT'), studentUser.id],
    });
  });
  it('an expired session QR is not an expired login, but actual auth failures still signal logout', async () => {
    const expired = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, expired);
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          json({ code: 'QR_INVALID_OR_EXPIRED', messageKey: 'attendance.invalidQr' }, 401),
        ),
      );
      await expect(checkInStudent('a-valid-length-session-challenge', 'key')).rejects.toMatchObject(
        { status: 401 },
      );
      expect(expired).not.toHaveBeenCalled();
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => json({ code: 'UNAUTHENTICATED', messageKey: 'auth.required' }, 401)),
      );
      await expect(getStudentQr()).rejects.toMatchObject({ status: 401 });
      expect(expired).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(AUTH_EXPIRED_EVENT, expired);
    }
  });
  it('keeps checkout retries idempotent and treats returned checkout status separately from payment', async () => {
    const request = vi.fn(async (url: string) => {
      if (url.includes('finance-summary'))
        return json({ balance: '60.00', totalDebits: '100.00', totalCredits: '40.00' });
      if (url.includes('/installments') && !url.includes('checkout'))
        return json({
          items: [
            {
              id: 'unpaid',
              ordinal: 1,
              dueDate: '2026-09-01',
              originalAmount: '100.00',
              allocatedAmount: '40.00',
              outstandingAmount: '60.00',
              state: 'OVERDUE',
              payable: true,
            },
            {
              id: 'paid',
              ordinal: 2,
              dueDate: '2026-09-02',
              originalAmount: '100.00',
              allocatedAmount: '100.00',
              outstandingAmount: '0.00',
              state: 'PAID',
              payable: false,
            },
          ],
          nextCursor: null,
        });
      return json({
        attemptId: 'attempt',
        status: 'PENDING',
        checkoutUrl: 'https://pay.example.invalid/test',
      });
    });
    vi.stubGlobal('fetch', request);
    mount(<StudentFinance enrollmentId="enrollment" user={studentUser} locale="en" />);
    const pay = await screen.findByRole('button', { name: studentText('en', 'pay') });
    expect(screen.getAllByRole('button', { name: studentText('en', 'pay') })).toHaveLength(1);
    fireEvent.click(pay);
    const submit = within(screen.getByRole('dialog')).getByRole('button', {
      name: studentText('en', 'pay'),
    });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(
      await screen.findByRole('link', { name: managementText('en', 'openCheckout') }),
    ).toHaveAttribute('href', 'https://pay.example.invalid/test');
    expect(screen.getAllByText(managementText('en', 'checkoutHint'))).toHaveLength(2);
    expect(request.mock.calls.filter(([url]) => url.includes('checkout'))).toHaveLength(1);
  });
  it.each(['javascript:alert(1)', 'http://untrusted.invalid/pay'])(
    'refuses unsafe checkout destination %s',
    async (checkoutUrl) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => json({ attemptId: 'attempt', status: 'CREATED', checkoutUrl })),
      );
      await expect(createStudentCheckout('installment', 'key')).rejects.toThrow(
        'Invalid checkout URL',
      );
    },
  );
  it('uses course names rather than student names on personal enrollment cards', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({
          items: [
            {
              id: 'enrollment',
              state: 'ACTIVE',
              student: { name: 'Student' },
              program: { name: 'English A2' },
            },
          ],
          nextCursor: null,
        }),
      ),
    );
    expect((await getStudentPage('enrollments', {})).items[0]?.name).toBe('English A2');
  });
});
