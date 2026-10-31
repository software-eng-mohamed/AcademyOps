import { PlgApiError } from '@academyops/api-client/http';
import { PlgMotionProvider } from '@academyops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { academyKey } from '@/api/academy/queries';
import { managementKey } from '@/api/management/queries';
import { ErrorNotice } from '@/features/academy/academy-ui';
import { canRunManagementAction } from '@/features/management/action-access';
import { AttendanceTools } from '@/features/management/attendance-tools';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { operationsText } from '@/i18n/operations-copy';
import { attendanceUser } from './attendance-user.fixture';
import { trainerUser } from './trainer-user.fixture';

vi.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
let client: QueryClient;
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const mount = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={client}>
      <PlgMotionProvider>{ui}</PlgMotionProvider>
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

describe.each([attendanceUser, trainerUser])(
  '$name uses shared controls and actual permissions',
  (user) => {
    it.each(['SCHEDULED', 'OPEN', 'CLOSED', 'LOCKED'])(
      'enforces window and correction limits for %s',
      (state) => {
        const row = {
          id: 'row',
          name: 'Student',
          code: '',
          status: '',
          version: 1,
          data: { session: { attendanceWindowState: state } },
        };
        expect(canRunManagementAction(user, 'recordAttendance', row)).toBe(
          ['OPEN', 'CLOSED'].includes(state),
        );
        expect(canRunManagementAction(user, 'correctAttendance', row)).toBe(state !== 'LOCKED');
        expect(canRunManagementAction(user, 'recordPayment', row)).toBe(false);
        expect(canRunManagementAction(user, 'completeSession', row)).toBe(false);
      },
    );
    it.each(['SCHEDULED', 'CLOSED', 'LOCKED'])(
      'hides scan/QR for %s but keeps exceptions readable',
      (state) => {
        mount(
          <AttendanceTools
            session={{ id: 'session', status: 'SCHEDULED', attendanceWindowState: state }}
            user={user}
            locale="en"
          />,
        );
        expect(screen.queryByRole('button', { name: 'Session QR code' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Record student QR' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Attendance exceptions' })).toBeVisible();
      },
    );
    it('validates scan input and refreshes roster, student/enrollment detail and overview after saving', async () => {
      const request = vi.fn(async () => json({ id: 'record', status: 'PRESENT', version: 1 }));
      vi.stubGlobal('fetch', request);
      const invalidate = vi.spyOn(client, 'invalidateQueries');
      mount(
        <AttendanceTools
          session={{ id: 'session', status: 'SCHEDULED', attendanceWindowState: 'OPEN' }}
          user={user}
          locale="en"
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Record student QR' }));
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      expect(request).not.toHaveBeenCalled();
      fireEvent.change(screen.getByLabelText(operationsText('en', 'token')), {
        target: { value: 'synthetic-token' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(request).toHaveBeenCalledOnce();
      expect(invalidate).toHaveBeenCalledWith({ queryKey: managementKey(user.id) });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: academyKey(user.id) });
      expect(
        invalidate.mock.calls.some(([filter]) => typeof filter?.predicate === 'function'),
      ).toBe(true);
    });
    it.each(['en', 'ar'] as const)('provides actionable attendance errors in %s', (locale) => {
      const copy = getAcademyCopy(locale);
      for (const [code, message] of [
        ['ATTENDANCE_CORRECTION_DENIED', copy.attendanceLocked],
        ['ATTENDANCE_RESOURCE_NOT_FOUND', copy.attendanceUnavailable],
        ['ATTENDANCE_WINDOW_NOT_OPEN', copy.attendanceWindowClosed],
        ['MANUAL_ATTENDANCE_WINDOW_INVALID', copy.attendanceWindowClosed],
        ['ATTENDANCE_ALREADY_RECORDED', copy.attendanceAlreadyRecorded],
        ['ATTENDANCE_RECORDED', copy.attendanceAlreadyRecorded],
        ['INVALID_STUDENT_QR_TOKEN', copy.attendanceInvalidQr],
        ['NOT_IN_SESSION_ROSTER', copy.attendanceNotInRoster],
      ] as const) {
        const view = mount(
          <ErrorNotice
            copy={copy}
            error={new PlgApiError(409, { code, messageKey: 'attendance.error' })}
          />,
        );
        expect(screen.getByRole('alert')).toHaveTextContent(message);
        view.unmount();
      }
    });
  },
);
