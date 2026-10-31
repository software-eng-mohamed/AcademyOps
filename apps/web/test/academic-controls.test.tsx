import { PlgApiError } from '@academyops/api-client/http';
import { PlgMotionProvider } from '@academyops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AcademyPage } from '@/features/academy/academy-page';
import { ErrorNotice } from '@/features/academy/academy-ui';
import { DetailDrawer } from '@/features/academy/detail-drawer';
import { StaffOverviewContent } from '@/features/dashboard/overview/staff-overview-content';
import { canRunManagementAction } from '@/features/management/action-access';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { academicUser } from './academic-user.fixture';
import { staffFixtures } from './staff-overview.fixture';
import { workspaceFixture } from './workspace-overview.fixture';

vi.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock('next/dynamic', () => ({ default: () => () => <div data-chart-slot /> }));
const clients: QueryClient[] = [];
function mount(ui: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <PlgMotionProvider>{ui}</PlgMotionProvider>
    </QueryClientProvider>,
  );
}
function json(value: unknown) {
  return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
}
beforeEach(() => {
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
  for (const client of clients) client.clear();
  clients.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Academic using shared library controls', () => {
  it.each(
    (['en', 'ar'] as const).flatMap((locale) =>
      (
        [
          ['COHORT_DATES_REQUIRED', 'cohortDatesRequired', 'academic.cohortDatesRequired'],
          ['COHORT_SESSIONS_REQUIRED', 'cohortSessionsRequired', 'academic.cohortSessionsRequired'],
          ['SCHEDULE_CONFLICT', 'scheduleConflict', 'academic.scheduleConflict'],
          ['SESSION_NOT_FINISHED', 'sessionNotFinished', 'academic.sessionNotFinished'],
          [
            'ATTENDANCE_CHECK_IN_PERIOD_CLOSED',
            'attendancePeriodClosed',
            'attendance.checkInPeriodClosed',
          ],
        ] as const
      ).map(([code, key, messageKey]) => ({ locale, code, key, messageKey })),
    ),
  )(
    'explains $code in $locale instead of asking for an irrelevant reload',
    ({ locale, code, key, messageKey }) => {
      const copy = getAcademyCopy(locale);
      mount(<ErrorNotice error={new PlgApiError(409, { code, messageKey })} copy={copy} />);
      expect(screen.getByRole('alert')).toHaveTextContent(copy[key]);
      expect(screen.queryByText(copy.conflict)).not.toBeInTheDocument();
    },
  );
  it.each(['en', 'ar'] as const)(
    'links overview groups and upcoming sessions to working shared destinations in %s',
    (locale) => {
      mount(
        <StaffOverviewContent
          data={staffFixtures.ACADEMIC}
          overview={workspaceFixture('ACADEMIC')}
          locale={locale}
        />,
      );
      expect(screen.getByRole('link', { name: 'Group Alpha' })).toHaveAttribute(
        'href',
        `/${locale}/academic/cohorts?record=cohort-1`,
      );
      expect(
        document.querySelector(`a[href="/${locale}/sessions?record=session-a"]`),
      ).toBeInTheDocument();
      expect(document.querySelector(`a[href="/${locale}/academic/cohorts"]`)).toBeInTheDocument();
    },
  );
  it.each(['students', 'enrollments'] as const)(
    'does not offer creation on the read-only %s directory',
    async (section) => {
      window.history.replaceState(null, '', `/en/${section}`);
      const request = vi.fn(async (url: string) =>
        json(
          url.includes('/auth/me')
            ? { branches: [{ id: 'main' }] }
            : { items: [], nextCursor: null },
        ),
      );
      vi.stubGlobal('fetch', request);
      const copy = getAcademyCopy('en');
      mount(<AcademyPage section={section} user={academicUser} />);
      await screen.findByRole('heading', { name: copy.noResults });
      expect(
        screen.queryByRole('button', { name: new RegExp(copy.create, 'i') }),
      ).not.toBeInTheDocument();
      expect(
        request.mock.calls.every(
          ([url]) => !url.includes('pricing') && !url.includes('business-accounts'),
        ),
      ).toBe(true);
    },
  );
  it.each(['ACTIVE', 'DRAFT', 'PENDING_APPROVAL'] as const)(
    'shows only the allowed enrollment actions for %s, without requesting pricing',
    async (state) => {
      const copy = getAcademyCopy('en');
      const request = vi.fn(async (url: string) =>
        json(
          url.includes('attendance-summary')
            ? {
                ratio: '1.0000',
                minimumRatio: '0.8000',
                numerator: 1,
                denominator: 1,
                makeupCredits: 0,
              }
            : {
                id: 'enrollment-1',
                state,
                version: 1,
                student: { name: 'Student' },
                retakes: [],
                cancellationRequests: [
                  { id: 'cancel-1', status: 'REQUESTED', reason: 'Review requested' },
                ],
              },
        ),
      );
      vi.stubGlobal('fetch', request);
      mount(
        <DetailDrawer
          selection={{
            resource: 'enrollments',
            row: {
              id: 'enrollment-1',
              name: 'Student',
              code: '',
              status: state,
              version: 1,
              data: {},
            },
          }}
          user={academicUser}
          locale="en"
          copy={copy}
          canGoBack={false}
          onBack={vi.fn()}
          onClose={vi.fn()}
          onInspect={vi.fn()}
          onAction={vi.fn()}
        />,
      );
      await screen.findByRole('heading', { name: 'Attendance summary' });
      for (const action of [
        copy.submit,
        copy.activate,
        copy.reject,
        copy.approveCancellation,
        copy.rejectCancellation,
      ])
        expect(screen.queryByRole('button', { name: action })).not.toBeInTheDocument();
      if (state === 'ACTIVE')
        for (const action of [
          copy.transfer,
          copy.postpone,
          copy.complete,
          copy.requestCancellation,
          copy.retake,
        ])
          expect(screen.getByRole('button', { name: action })).toBeVisible();
      expect(
        screen.queryByRole('heading', { name: 'Fees & installments' }),
      ).not.toBeInTheDocument();
      expect(request.mock.calls.some(([url]) => url.includes('pricing-agreements'))).toBe(false);
    },
  );
  it('keeps student detail read-only while allowing inspection of academic records', async () => {
    const copy = getAcademyCopy('en');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({
          id: 'student-1',
          name: 'Student',
          publicId: 'ST1',
          contacts: [
            { id: 'email-1', type: 'EMAIL', rawValue: 'synthetic@example.test', isPrimary: true },
          ],
          enrollments: [
            {
              id: 'enrollment-1',
              state: 'ACTIVE',
              program: { name: 'Course' },
              cohort: { name: 'Group' },
            },
          ],
        }),
      ),
    );
    mount(
      <DetailDrawer
        selection={{
          resource: 'students',
          row: { id: 'student-1', name: 'Student', code: 'ST1', status: '', version: 1, data: {} },
        }}
        user={academicUser}
        locale="en"
        copy={copy}
        canGoBack={false}
        onBack={vi.fn()}
        onClose={vi.fn()}
        onInspect={vi.fn()}
        onAction={vi.fn()}
      />,
    );
    await screen.findByText('synthetic@example.test');
    expect(
      screen.getByRole('heading', { name: 'Student', level: 2 }).parentElement,
    ).not.toHaveTextContent(copy.none);
    for (const action of [copy.edit, copy.editContacts, copy.merge])
      expect(screen.queryByRole('button', { name: action })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.view })).toBeVisible();
  });
  it('allows locked attendance correction but never certificate revocation', () => {
    const row = {
      id: 'record',
      name: '',
      code: '',
      status: '',
      version: 1,
      data: { session: { attendanceWindowState: 'LOCKED' } },
    };
    expect(canRunManagementAction(academicUser, 'recordAttendance', row)).toBe(false);
    expect(canRunManagementAction(academicUser, 'correctAttendance', row)).toBe(true);
    expect(canRunManagementAction(academicUser, 'revokeCertificate', row)).toBe(false);
  });
});
