import { PlgMotionProvider } from '@academyops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AcademyPage } from '@/features/academy/academy-page';
import { DetailDrawer } from '@/features/academy/detail-drawer';
import { actionFields } from '@/features/management/actions';
import { ManagementDetail } from '@/features/management/detail-drawer';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { salesUser } from './sales-user.fixture';

vi.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
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

describe('Sales uses the shared workspace with assigned-only controls', () => {
  it('does not offer reactivating an archived company or trap an unsaved archive selection', () => {
    expect(
      actionFields('editAccount', { status: 'ARCHIVED' }, 'ARCHIVED').find(
        (field) => field.name === 'status',
      )?.options,
    ).toEqual(['ARCHIVED']);
    expect(
      actionFields('editAccount', { status: 'ARCHIVED' }, 'ACTIVE').find(
        (field) => field.name === 'status',
      )?.options,
    ).toEqual(['ACTIVE', 'ARCHIVED']);
  });
  it.each(['programs', 'cohorts', 'resources', 'stages'] as const)(
    'keeps %s read-only',
    async (section) => {
      window.history.replaceState(
        null,
        '',
        section === 'stages' ? '/en/leads?tab=stages' : `/en/${section}`,
      );
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) =>
          json(
            url.includes('lead-stages')
              ? []
              : url.includes('/auth/me')
                ? { branches: [{ id: 'main' }] }
                : { items: [], nextCursor: null },
          ),
        ),
      );
      mount(<AcademyPage section={section === 'stages' ? 'leads' : section} user={salesUser} />);
      await screen.findByRole('heading', { name: getAcademyCopy('en').noResults });
      expect(
        screen.queryByRole('button', { name: /New program|New cohort|Add room|Add stage/ }),
      ).not.toBeInTheDocument();
    },
  );
  it('cannot modify organization stages despite branch lead-assignment authority', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({
          id: 'stage',
          name: 'Contacted',
          code: 'CONTACTED',
          active: true,
          version: 1,
          ordinal: 1,
        }),
      ),
    );
    mount(
      <DetailDrawer
        selection={{
          resource: 'stages',
          row: {
            id: 'stage',
            name: 'Contacted',
            code: 'CONTACTED',
            status: 'ACTIVE',
            version: 1,
            data: {},
          },
        }}
        user={salesUser}
        locale="en"
        copy={getAcademyCopy('en')}
        canGoBack={false}
        onBack={vi.fn()}
        onClose={vi.fn()}
        onInspect={vi.fn()}
        onAction={vi.fn()}
      />,
    );
    await screen.findByRole('heading', { name: 'Details' });
    for (const name of ['Edit', 'Deactivate', 'Enable'])
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  });
  it('does not request company-wide financial balances with assigned financial grants', async () => {
    const request = vi.fn(async () =>
      json({
        id: 'company',
        displayName: 'Company',
        legalName: 'Company Ltd',
        status: 'ACTIVE',
        version: 1,
        contacts: [],
        billingAccount: { id: 'company-billing' },
      }),
    );
    vi.stubGlobal('fetch', request);
    mount(
      <ManagementDetail
        resource="businessAccounts"
        row={{ id: 'company', name: 'Company', code: '', status: 'ACTIVE', version: 1, data: {} }}
        user={salesUser}
        locale="en"
        onClose={vi.fn()}
        onAction={vi.fn()}
      />,
    );
    await screen.findByRole('heading', { name: 'Details' });
    expect(screen.getByRole('button', { name: 'Edit company' })).toBeVisible();
    expect(request.mock.calls).toHaveLength(1);
  });
  it.each(['DRAFT', 'PENDING_APPROVAL', 'ACTIVE'] as const)(
    'shows assigned fee and enrollment controls for %s, not academic approval',
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
                student: { name: 'Sales student' },
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
            row: { id: 'e', name: 'Sales student', status: state, code: '', version: 1, data: {} },
          }}
          user={salesUser}
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
      for (const name of [
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
        expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
      if (state === 'DRAFT')
        expect(screen.getByRole('button', { name: copy.submit })).toBeVisible();
      if (state === 'ACTIVE')
        expect(screen.getByRole('button', { name: copy.requestCancellation })).toBeVisible();
      expect(request.mock.calls.some(([url]) => url.includes('attendance-summary'))).toBe(false);
    },
  );
});
