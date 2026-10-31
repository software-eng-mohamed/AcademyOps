import { PlgApiError } from '@academyops/api-client/http';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorNotice } from '@/features/academy/academy-ui';
import { ActionDialog } from '@/features/academy/action-dialog';
import { DetailDrawer } from '@/features/academy/detail-drawer';
import { canRunManagementAction } from '@/features/management/action-access';
import { AttendancePolicies } from '@/features/management/attendance-policies';
import { AttendanceTools } from '@/features/management/attendance-tools';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { operationsUser } from './operations-user.fixture';

const clients: QueryClient[] = [];
function mount(ui: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return client;
}
function json(value: unknown) {
  return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
}
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
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
  for (const client of clients) client.clear();
  clients.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Operations shared controls', () => {
  it.each(['en', 'ar'] as const)('explains missing certificate configuration in %s', (locale) => {
    const copy = getAcademyCopy(locale);
    mount(
      <ErrorNotice
        copy={copy}
        error={
          new PlgApiError(409, {
            code: 'CERTIFICATE_RULE_MISSING',
            messageKey: 'certificates.ruleMissing',
          })
        }
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(copy.certificateRuleMissing);
    expect(screen.queryByText(copy.conflict)).not.toBeInTheDocument();
  });
  it('renders attendance and pricing together without duplicate sibling keys', async () => {
    const errors = vi.spyOn(console, 'error');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        json(
          url.includes('attendance-summary')
            ? {
                ratio: '1.0000',
                minimumRatio: '0.8000',
                numerator: 1,
                denominator: 1,
                makeupCredits: 0,
              }
            : url.includes('pricing-agreements')
              ? { items: [], nextCursor: null }
              : {
                  id: 'enrollment-1',
                  state: 'ACTIVE',
                  version: 1,
                  student: { name: 'Student' },
                  retakes: [],
                },
        ),
      ),
    );
    mount(
      <DetailDrawer
        selection={{
          resource: 'enrollments',
          row: {
            id: 'enrollment-1',
            name: 'Student',
            code: '',
            status: 'ACTIVE',
            version: 1,
            data: {},
          },
        }}
        user={operationsUser}
        locale="en"
        copy={getAcademyCopy('en')}
        canGoBack={false}
        onBack={vi.fn()}
        onClose={vi.fn()}
        onInspect={vi.fn()}
        onAction={vi.fn()}
      />,
    );
    await screen.findByRole('heading', { name: 'Fees & installments' });
    await screen.findByRole('heading', { name: 'Attendance summary' });
    expect(
      errors.mock.calls.some((call) => call.some((value) => String(value).includes('same key'))),
    ).toBe(false);
  });
  it('saves a policy through the shared date inputs with numeric limits and an effective date', async () => {
    const request = vi.fn(async (_url: unknown, options?: RequestInit) =>
      json(options?.method === 'POST' ? { id: 'policy-1', version: 1 } : { items: [] }),
    );
    vi.stubGlobal('fetch', request);
    mount(
      <AttendancePolicies programVersionId="version-1" userId={operationsUser.id} locale="en" />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'New policy version' }));
    fireEvent.change(screen.getByLabelText('Minimum attendance (%)'), { target: { value: '85' } });
    fireEvent.change(screen.getByLabelText('Effective from'), {
      target: { value: '2026-09-06T09:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(request.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(true),
    );
    const sent = request.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(sent?.[0]).toBe('/api/v1/attendance-policies');
    expect(JSON.parse(String(sent?.[1]?.body))).toEqual({
      programVersionId: 'version-1',
      minimumRatio: 0.85,
      lockAfterMinutes: 1440,
      checkInOpensBeforeMinutes: 30,
      checkInClosesAfterMinutes: 30,
      effectiveFrom: new Date('2026-09-06T09:00').toISOString(),
    });
    await waitFor(() => expect(screen.queryByLabelText('Effective from')).not.toBeInTheDocument());
  });
  it('edits the student name without rendering or resending sensitive fields', async () => {
    const request = vi.fn(async () => json({ id: 'student-1', version: 2 }));
    vi.stubGlobal('fetch', request);
    mount(
      <ActionDialog
        target={{
          resource: 'students',
          action: 'edit',
          row: {
            id: 'student-1',
            name: 'Student',
            code: 'ST',
            status: 'ACTIVE',
            version: 1,
            data: { name: 'Student', birthDate: '2000-01-01', gender: 'MALE' },
          },
        }}
        userId={operationsUser.id}
        canEditSensitive={false}
        locale="en"
        copy={getAcademyCopy('en')}
        onClose={vi.fn()}
        onSaved={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.queryByRole('button', { name: /Gender/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Birth date/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Full name *' }), {
      target: { value: 'Student Updated' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(request).toHaveBeenCalledWith(
      '/api/v1/students/student-1',
      expect.objectContaining({ body: JSON.stringify({ name: 'Student Updated' }) }),
    );
  });
  it('does not request QR tokens until requested, expires them and never caches the token', async () => {
    const request = vi.fn(async () =>
      json({ token: 'SYNTHETIC-QR-SECRET', expiresAt: new Date(Date.now() + 700).toISOString() }),
    );
    vi.stubGlobal('fetch', request);
    const client = mount(
      <AttendanceTools
        session={{ id: 'session-1', status: 'SCHEDULED', attendanceWindowState: 'OPEN' }}
        user={operationsUser}
        locale="en"
      />,
    );
    expect(request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Session QR code' }));
    expect(request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Generate new code' }));
    await waitFor(() =>
      expect(document.querySelector('svg title')?.textContent).toBe('Session QR code'),
    );
    expect(request).toHaveBeenCalledOnce();
    expect(
      JSON.stringify(
        client
          .getMutationCache()
          .getAll()
          .map((item) => item.state),
      ),
    ).not.toContain('SYNTHETIC-QR-SECRET');
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    await screen.findByText('Code expired. Generate a new one.', {}, { timeout: 2000 });
    expect(document.querySelector('svg title')).toBeNull();
  });
  it.each(['CLOSED', 'LOCKED', 'NOT_OPENED'])('hides QR and scan tools for %s', (state) => {
    mount(
      <AttendanceTools
        session={{ id: 'session-1', status: 'SCHEDULED', attendanceWindowState: state }}
        user={operationsUser}
        locale="en"
      />,
    );
    expect(screen.queryByRole('button', { name: 'Session QR code' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record student QR' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Attendance exceptions' })).toBeInTheDocument();
  });
  it('hides manual recording outside an open/closed window and checks locked-correction authority', () => {
    const row = {
      id: 'row',
      name: 'Student',
      code: '',
      status: '',
      version: 1,
      data: { session: { attendanceWindowState: 'LOCKED' } },
    };
    expect(canRunManagementAction(operationsUser, 'recordAttendance', row)).toBe(false);
    expect(canRunManagementAction(operationsUser, 'correctAttendance', row)).toBe(true);
    const limited = {
      ...operationsUser,
      permissions: operationsUser.permissions.filter(
        (item) => item.code !== 'attendance.correct_after_lock',
      ),
    };
    expect(canRunManagementAction(limited, 'correctAttendance', row)).toBe(false);
    expect(canRunManagementAction(operationsUser, 'revokeCertificate', row)).toBe(false);
  });
});
