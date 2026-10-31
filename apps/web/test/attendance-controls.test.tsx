import { PlgApiError } from '@academyops/api-client/http';
import { PlgMotionProvider } from '@academyops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AcademyPage } from '@/features/academy/academy-page';
import { ErrorNotice } from '@/features/academy/academy-ui';
import { DetailDrawer } from '@/features/academy/detail-drawer';
import { AttendanceOverview } from '@/features/dashboard/overview/staff-learning-overviews';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { managementText } from '@/i18n/management-copy';
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
    it('isolates trace identifiers from Arabic text on narrow error banners', () => {
      const id = '965d41b6-fbfe-4a45-9c3f-4b5cd0513b42';
      mount(
        <ErrorNotice
          copy={getAcademyCopy('ar')}
          error={
            new PlgApiError(403, {
              code: 'INVALID_STUDENT_QR_TOKEN',
              messageKey: 'attendance.invalidQr',
              correlationId: id,
            })
          }
        />,
      );
      expect(screen.getByText(id).tagName).toBe('BDI');
      expect(screen.getByText(id)).toHaveAttribute('dir', 'ltr');
      expect(screen.getByRole('alert')).toHaveTextContent(getAcademyCopy('ar').attendanceInvalidQr);
    });
    it('translates the source of automatically finalized absences', () => {
      expect(managementText('en', 'SYSTEM_CLOSE')).toBe('Roster finalization');
      expect(managementText('ar', 'SYSTEM_CLOSE')).toBe('إغلاق كشف الحضور');
    });
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
        mount(<AcademyPage section={section} user={user} />);
        await screen.findByRole('heading', { name: getAcademyCopy('en').noResults });
        expect(
          screen.queryByRole('button', {
            name: /Add student|New enrollment|New program|New cohort|Add room|Add new/,
          }),
        ).not.toBeInTheDocument();
      },
    );
    it.each(['en', 'ar'] as const)(
      'links the overview agenda directly to the %s roster',
      (locale) => {
        mount(
          <AttendanceOverview
            locale={locale}
            data={{ kind: 'ATTENDANCE', recordsToday: [], windows: [], days: [] }}
            queue={{
              kind: 'TODAY',
              total: 1,
              items: [
                {
                  id: 'session-1',
                  title: 'Synthetic session',
                  subtitle: null,
                  at: '2026-09-06T10:00:00Z',
                  status: 'SCHEDULED',
                  amount: null,
                },
              ],
            }}
          />,
        );
        expect(screen.getByRole('link', { name: /Synthetic session/ })).toHaveAttribute(
          'href',
          `/${locale}/attendance?sessionId=session-1`,
        );
        expect(document.querySelector(`a[href="/${locale}/attendance"]`)).not.toBeNull();
      },
    );
    it.each(['en', 'ar'] as const)(
      'hides student contacts even if a response contains them in %s',
      async (locale) => {
        vi.stubGlobal(
          'fetch',
          vi.fn(async () =>
            json({
              id: 'student',
              name: 'Student',
              version: 1,
              contacts: [{ type: 'EMAIL', rawValue: 'private@e2e.invalid' }],
              enrollments: [],
            }),
          ),
        );
        mount(
          <DetailDrawer
            selection={{
              resource: 'students',
              row: {
                id: 'student',
                name: 'Student',
                code: '',
                status: 'ACTIVE',
                version: 1,
                data: {},
              },
            }}
            user={user}
            locale={locale}
            copy={getAcademyCopy(locale)}
            canGoBack={false}
            onBack={vi.fn()}
            onClose={vi.fn()}
            onInspect={vi.fn()}
            onAction={vi.fn()}
          />,
        );
        await screen.findByRole('heading', { name: getAcademyCopy(locale).details });
        expect(
          screen.queryByRole('heading', { name: getAcademyCopy(locale).contacts }),
        ).not.toBeInTheDocument();
        expect(screen.queryByText('private@e2e.invalid')).not.toBeInTheDocument();
      },
    );
    it('shows enrollment attendance summary without querying pricing', async () => {
      const request = vi.fn(async (url: string) =>
        json(
          url.includes('attendance-summary')
            ? {
                ratio: '0.7500',
                minimumRatio: '0.8000',
                numerator: 3,
                denominator: 4,
                makeupCredits: 0,
              }
            : {
                id: 'enrollment',
                state: 'ACTIVE',
                version: 1,
                student: { name: 'Student' },
                retakes: [],
              },
        ),
      );
      vi.stubGlobal('fetch', request);
      mount(
        <DetailDrawer
          selection={{
            resource: 'enrollments',
            row: {
              id: 'enrollment',
              name: 'Student',
              code: '',
              status: 'ACTIVE',
              version: 1,
              data: {},
            },
          }}
          user={user}
          locale="en"
          copy={getAcademyCopy('en')}
          canGoBack={false}
          onBack={vi.fn()}
          onClose={vi.fn()}
          onInspect={vi.fn()}
          onAction={vi.fn()}
        />,
      );
      await screen.findByText('75%');
      expect(screen.getByRole('heading', { name: 'Attendance summary' })).toBeVisible();
      expect(request.mock.calls.some(([url]) => /pricing|finance/.test(url))).toBe(false);
      expect(
        screen.queryByRole('heading', { name: 'Fees & installments' }),
      ).not.toBeInTheDocument();
    });
  },
);
