import { PlgMotionProvider } from '@academyops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserPermissionGrantDtoCode } from '@/api/generated/models/userPermissionGrantDtoCode';
import { getManagementPage, managementRow } from '@/api/management/queries';
import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { actionPermissions, createActions } from '@/features/management/actions';
import { managementSections, sectionPermissions } from '@/features/management/config';
import { ManagementPage } from '@/features/management/management-page';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { managementText } from '@/i18n/management-copy';

vi.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock('@/api/management/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/management/queries')>()),
  getManagementPage: vi.fn(async () => ({ items: [], nextCursor: null })),
}));
const user: DashboardUser = {
  id: 'owner-1',
  name: 'Owner',
  branches: [],
  organization: { name: 'Academy' },
  roles: [{ code: 'OWNER', name: 'Owner' }],
  permissions: [...new Set(Object.values(sectionPermissions).flat())].map((code) => ({
    code: code as UserPermissionGrantDtoCode,
    scopes: ['O'],
  })),
};
let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.clearAllMocks();
  vi.mocked(getManagementPage).mockResolvedValue({ items: [], nextCursor: null });
  for (const key of ['IntersectionObserver', 'ResizeObserver'])
    vi.stubGlobal(
      key,
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
function mount(section: (typeof managementSections)[number], subject: DashboardUser = user) {
  const tree = () => (
    <QueryClientProvider client={client}>
      <PlgMotionProvider>
        <ManagementPage section={section} user={subject} />
      </PlgMotionProvider>
    </QueryClientProvider>
  );
  const view = render(tree());
  return { ...view, refresh: () => view.rerender(tree()) };
}
describe('management pages with real library controls', () => {
  it('keeps invalid session creation local and focuses the missing lookup like Academy forms', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    window.history.replaceState(null, '', '/en/sessions');
    mount('sessions', {
      ...user,
      permissions: [...user.permissions, { code: 'academic.sessions.manage', scopes: ['O'] }],
    });
    await screen.findByRole('heading', { name: getAcademyCopy('en').noResults });
    fireEvent.click(screen.getByRole('button', { name: managementText('en', 'createSession') }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    const cohort = screen.getByRole('combobox', { name: 'Cohort *' });
    expect(cohort).toHaveFocus();
    expect(cohort).toHaveAttribute('aria-invalid', 'true');
    expect(cohort).toHaveAccessibleDescription(getAcademyCopy('en').required);
    expect(screen.getByRole('textbox', { name: /Session number/ })).toHaveValue('1');
    fireEvent.click(screen.getByRole('button', { name: /Delivery/ }));
    // Radix Select renders options in a portal that jsdom cannot access.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    ['en', '', 'All statuses'],
    ['en', '?status=SCHEDULED', 'Scheduled'],
    ['ar', '', 'كل الحالات'],
    ['ar', '?status=SCHEDULED', 'مجدولة'],
  ] as const)(
    'shows a nonempty status filter in %s with %s before opening it',
    async (locale, query, expected) => {
      window.history.replaceState(null, '', `/${locale}/sessions${query}`);
      mount('sessions');
      const trigger = await screen.findByRole('button', {
        name: new RegExp(getAcademyCopy(locale).selectStatus),
      });
      expect(trigger).toHaveTextContent(expected);
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      const label = screen.getByText(getAcademyCopy(locale).selectStatus, { selector: 'label' });
      expect(label).toBeVisible();
      expect(label).toHaveAttribute('for', trigger.id);
    },
  );
  it.each(['sessions', 'payments', 'certificates', 'documents'] as const)(
    'opens the real %s creation form without a tab/select context crash',
    async (section) => {
      const resource = section === 'documents' ? 'invoices' : section;
      const action = createActions[resource];
      if (!action) throw new Error('Expected create action');
      window.history.replaceState(null, '', `/en/${section}`);
      mount(section, {
        ...user,
        permissions: [...user.permissions, { code: actionPermissions[action], scopes: ['O'] }],
      });
      await screen.findByRole('heading', { name: getAcademyCopy('en').noResults });
      fireEvent.click(screen.getByRole('button', { name: managementText('en', action) }));
      expect(
        await screen.findByRole('dialog', { name: managementText('en', action) }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', {
          name: action.startsWith('create')
            ? getAcademyCopy('en').create
            : getAcademyCopy('en').confirmation,
        }),
      ).toBeInTheDocument();
    },
  );
  it.each(managementSections)(
    'renders %s with its data state and accessible tab',
    async (section) => {
      window.history.replaceState(null, '', `/en/${section}`);
      mount(section);
      expect(
        await screen.findByRole('heading', { name: getAcademyCopy('en').noResults }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: managementText('en', section), level: 1 }),
      ).toBeInTheDocument();
      expect(screen.getByRole('tabpanel')).toBeInTheDocument();
    },
  );
  it('switches document tabs without leaking select items into tab collections', async () => {
    window.history.replaceState(null, '', '/en/documents');
    const page = mount('documents');
    await screen.findByRole('heading', { name: getAcademyCopy('en').noResults });
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Receipts' }), {
      button: 0,
      ctrlKey: false,
    });
    await waitFor(() => expect(window.location.search).toBe('?tab=receipts'));
    page.refresh(); // Simulate Next's useSearchParams subscription after pushState.
    expect(screen.getByRole('tabpanel', { name: 'Receipts' })).toBeInTheDocument();
  });
  it.each(['', '?view=grid'])(
    'opens the session roster through URL-backed navigation from %s',
    async (view) => {
      vi.mocked(getManagementPage).mockImplementation(async (resource) => ({
        items:
          resource === 'sessions'
            ? [
                managementRow('sessions', {
                  id: 'session-1',
                  module: { name: 'Leadership' },
                  status: 'SCHEDULED',
                }),
              ]
            : [],
        nextCursor: null,
      }));
      window.history.replaceState(null, '', `/en/attendance${view}`);
      const page = mount('attendance');
      fireEvent.click(await screen.findByRole('button', { name: 'Leadership' }));
      await waitFor(() =>
        expect(new URLSearchParams(window.location.search).get('sessionId')).toBe('session-1'),
      );
      page.refresh();
      expect(await screen.findByRole('button', { name: 'Back to sessions' })).toBeInTheDocument();
      expect(
        vi
          .mocked(getManagementPage)
          .mock.calls.some(
            ([resource, filters]) => resource === 'roster' && filters.sessionId === 'session-1',
          ),
      ).toBe(true);
    },
  );
});
