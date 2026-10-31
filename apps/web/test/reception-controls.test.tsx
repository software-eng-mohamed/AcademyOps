import { PlgMotionProvider } from '@academyops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AcademyPage } from '@/features/academy/academy-page';
import { actionPermission, recordActions } from '@/features/academy/actions';
import { DetailDrawer } from '@/features/academy/detail-drawer';
import { hasStaffPermission } from '@/features/dashboard/navigation';
import { StaffOverviewContent } from '@/features/dashboard/overview/staff-overview-content';
import { canRunManagementAction } from '@/features/management/action-access';
import { rowActions } from '@/features/management/actions';
import { ManagementDetail } from '@/features/management/detail-drawer';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { receptionUser } from './reception-user.fixture';
import { staffFixtures } from './staff-overview.fixture';
import { workspaceFixture } from './workspace-overview.fixture';

vi.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock('next/dynamic', () => ({ default: () => () => <div data-chart-slot /> }));
let client: QueryClient;
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
function mount(children: React.ReactNode) {
  return render(
    <QueryClientProvider client={client}>
      <PlgMotionProvider>{children}</PlgMotionProvider>
    </QueryClientProvider>,
  );
}
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

describe('Reception on the shared components', () => {
  it('omits empty actions from read-only session details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({
          id: 's',
          status: 'SCHEDULED',
          version: 1,
          cohortModule: { module: { name: 'Read-only lesson' } },
        }),
      ),
    );
    mount(
      <ManagementDetail
        resource="sessions"
        row={{
          id: 's',
          name: 'Read-only lesson',
          code: '',
          status: 'SCHEDULED',
          version: 1,
          data: {},
        }}
        user={receptionUser}
        locale="en"
        onClose={vi.fn()}
        onAction={vi.fn()}
      />,
    );
    await screen.findByRole('heading', { name: 'Details' });
    expect(screen.queryByRole('heading', { name: 'Actions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open attendance roster' })).not.toBeInTheDocument();
  });
  it.each(['en', 'ar'] as const)('links recent enrollment and today’s sessions in %s', (locale) => {
    mount(
      <StaffOverviewContent
        data={staffFixtures.RECEPTION}
        overview={workspaceFixture('RECEPTION')}
        locale={locale}
      />,
    );
    expect(screen.getByRole('link', { name: 'English basics' })).toHaveAttribute(
      'href',
      `/${locale}/enrollments?record=reg-1`,
    );
    expect(
      document.querySelector(`a[href="/${locale}/enrollments?status=DRAFT"]`),
    ).toBeInTheDocument();
    expect(
      document.querySelector(`a[href="/${locale}/sessions?record=session-a"]`),
    ).toBeInTheDocument();
  });
  it.each(['programs', 'cohorts', 'resources'] as const)(
    'keeps %s read-only without academic grants',
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
      mount(<AcademyPage section={section} user={receptionUser} />);
      await screen.findByRole('heading', { name: getAcademyCopy('en').noResults });
      expect(
        screen.queryByRole('button', { name: /New program|New cohort|Add room/ }),
      ).not.toBeInTheDocument();
    },
  );
  it('describes an assigned lead accurately without requesting the assignment directory', async () => {
    window.history.replaceState(null, '', '/en/leads');
    const request = vi.fn(async (url: string) =>
      json(
        url.includes('/auth/me')
          ? { branches: [{ id: 'main' }] }
          : {
              items: [
                {
                  id: 'l',
                  state: 'NEW',
                  version: 1,
                  person: { name: 'Assigned lead' },
                  assignedUserId: 'another-user',
                  stage: { name: 'Contacted' },
                },
              ],
              nextCursor: null,
            },
      ),
    );
    vi.stubGlobal('fetch', request);
    mount(<AcademyPage section="leads" user={receptionUser} />);
    expect(await screen.findByText(getAcademyCopy('en').assignedTeamMember)).toBeVisible();
    expect(request.mock.calls.some(([url]) => url.includes('assignees'))).toBe(false);
    expect(screen.getByRole('button', { name: 'Add lead' })).toBeVisible();
  });
  it.each(['DRAFT', 'PENDING_APPROVAL', 'ACTIVE'] as const)(
    'shows permitted learning and fee controls for %s without attendance requests',
    async (state) => {
      const copy = getAcademyCopy('en');
      const request = vi.fn(async (url: string) =>
        json(
          url.includes('pricing-agreements')
            ? { items: [], nextCursor: null }
            : {
                id: 'e',
                state,
                version: 1,
                student: { name: 'Reception student' },
                cancellationRequests: [{ id: 'c', status: 'REQUESTED', reason: 'Follow up' }],
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
              id: 'e',
              name: 'Reception student',
              status: state,
              code: '',
              version: 1,
              data: {},
            },
          }}
          user={receptionUser}
          locale="en"
          copy={copy}
          canGoBack={false}
          onBack={vi.fn()}
          onClose={vi.fn()}
          onInspect={vi.fn()}
          onAction={vi.fn()}
        />,
      );
      await screen.findByRole('heading', { name: 'Fees & installments' });
      for (const action of [
        copy.activate,
        copy.reject,
        copy.transfer,
        copy.postpone,
        copy.resume,
        copy.complete,
        copy.retake,
        copy.approveCancellation,
        copy.rejectCancellation,
      ])
        expect(screen.queryByRole('button', { name: action })).not.toBeInTheDocument();
      if (state === 'DRAFT')
        expect(screen.getByRole('button', { name: copy.submit })).toBeVisible();
      if (state === 'ACTIVE')
        expect(screen.getByRole('button', { name: copy.requestCancellation })).toBeVisible();
      expect(request.mock.calls.some(([url]) => url.includes('attendance-summary'))).toBe(false);
    },
  );
  it('does not offer claiming a lead that already has an assignee', () => {
    const record = {
      id: 'l',
      name: 'Lead',
      code: '',
      status: 'NEW',
      version: 1,
      data: { assignedUserId: 'another-user' },
    };
    const allowed = recordActions('leads', record).filter((action) =>
      hasStaffPermission(receptionUser, actionPermission('leads', action)),
    );
    expect(allowed).not.toContain('claim');
    expect(allowed).not.toContain('assign');
    expect(allowed).toContain('addActivity');
  });
  it.each([
    ['NOT_PRINTED', 'printCertificate'],
    ['PRINTED', 'readyCertificate'],
    ['READY_FOR_COLLECTION', 'collectCertificate'],
  ] as const)('permits certificate fulfillment %s only', (fulfillmentStatus, expected) => {
    const row = {
      id: 'c',
      name: 'Certificate',
      code: '',
      status: 'ISSUED',
      version: 1,
      data: { fulfillmentStatus, pdfStatus: 'AVAILABLE' },
    };
    expect(
      rowActions('certificates', row).filter((action) =>
        canRunManagementAction(receptionUser, action, row),
      ),
    ).toEqual([expected]);
  });
});
