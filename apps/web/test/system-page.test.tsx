import { PlgMotionProvider } from '@academyops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionGrantDtoPermissionCode } from '@/api/generated/models/permissionGrantDtoPermissionCode';
import type { UserPermissionGrantDtoCode } from '@/api/generated/models/userPermissionGrantDtoCode';
import { executeAccessAction, readChannel } from '@/api/system/commands';
import { getSystemDetail, getSystemPage } from '@/api/system/queries';
import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { getVisibleNavigation } from '@/features/dashboard/navigation';
import { AccessDialog } from '@/features/system/access-dialog';
import { SystemPage } from '@/features/system/system-page';
import { WhatsappPage } from '@/features/system/whatsapp-page';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { systemText } from '@/i18n/system-copy';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock('@/api/system/queries', async (original) => ({
  ...(await original<typeof import('@/api/system/queries')>()),
  getSystemPage: vi.fn(async () => ({ items: [], nextCursor: null })),
  getSystemDetail: vi.fn(async () => ({
    id: 'record-1',
    name: 'Operations',
    version: 4,
    code: 'OPS',
    grants: [],
  })),
}));
vi.mock('@/api/system/commands', async (original) => ({
  ...(await original<typeof import('@/api/system/commands')>()),
  executeAccessAction: vi.fn(async () => ({ id: 'new' })),
  readChannel: vi.fn(async () => ({
    state: 'DISABLED',
    version: 0,
    enabled: false,
    otpAvailable: false,
    needsQr: false,
  })),
}));
const user: DashboardUser = {
  id: 'owner-1',
  name: 'Owner',
  branches: [],
  organization: { name: 'Academy' },
  roles: [{ code: 'OWNER', name: 'Owner' }],
  permissions: Object.values(PermissionGrantDtoPermissionCode).map((code) => ({
    code: code as UserPermissionGrantDtoCode,
    scopes: ['O'],
  })),
};
let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.clearAllMocks();
  vi.mocked(getSystemPage).mockResolvedValue({ items: [], nextCursor: null });
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
function wrap(children: React.ReactNode) {
  return (
    <QueryClientProvider client={client}>
      <PlgMotionProvider>{children}</PlgMotionProvider>
    </QueryClientProvider>
  );
}

describe('complete Owner system pages with actual library components', () => {
  it.each(['en', 'ar'] as const)(
    'renders every system directory in %s without a tabs context crash',
    async (locale) => {
      for (const section of ['access', 'imports', 'audit', 'legacyArchive'] as const) {
        window.history.replaceState(null, '', `/${locale}/${section}`);
        const view = render(wrap(<SystemPage section={section} user={user} />));
        expect(
          await screen.findByRole('heading', { name: getAcademyCopy(locale).noResults }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole('heading', { name: systemText(locale, section), level: 1 }),
        ).toBeInTheDocument();
        expect(screen.getByRole('tabpanel')).toBeInTheDocument();
        expect(
          screen.queryByRole('button', { name: systemText(locale, 'system') }),
        ).not.toBeInTheDocument();
        if (section === 'access' || section === 'imports') {
          const label = screen.getByText(getAcademyCopy(locale).selectStatus, {
            selector: 'label',
          });
          const button = screen.getByRole('button', {
            name: new RegExp(getAcademyCopy(locale).selectStatus),
          });
          expect(label).toHaveAttribute('for', button.id);
          expect(button).toHaveTextContent(systemText(locale, 'allStatuses'));
        }
        view.unmount();
      }
    },
  );
  it('makes all Owner categories navigable without enabling other roles', () => {
    const owner = getVisibleNavigation(user);
    expect(owner.filter((entry) => entry.group === 'system')).toHaveLength(5);
    expect(owner.every((entry) => entry.available)).toBe(true);
    const staff = getVisibleNavigation({
      ...user,
      roles: [{ code: 'OPERATIONS', name: 'Operations' }],
    });
    expect(
      staff.filter((entry) => entry.group === 'system').every((entry) => !entry.available),
    ).toBe(true);
  });
  it('limits Access tabs to authorized resources and rejects an unauthorized URL tab', async () => {
    window.history.replaceState(null, '', '/en/access?tab=users');
    render(
      wrap(
        <SystemPage
          section="access"
          user={{ ...user, permissions: [{ code: 'roles.manage', scopes: ['O'] }] }}
        />,
      ),
    );
    await screen.findByRole('heading', { name: 'No records found' });
    expect(screen.getAllByRole('tab')).toHaveLength(1);
    expect(screen.getByRole('tab', { name: 'Roles' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Branches' })).not.toBeInTheDocument();
    expect(getSystemPage).toHaveBeenCalledWith('roles', {}, expect.any(AbortSignal));
    expect(screen.queryByRole('button', { name: 'Add team member' })).not.toBeInTheDocument();
  });
  it('shows real rows in card mode and opens their authoritative details', async () => {
    window.history.replaceState(null, '', '/en/access?tab=roles&view=grid');
    vi.mocked(getSystemPage).mockResolvedValue({
      items: [{ id: 'record-1', name: 'Operations', code: 'OPS', version: 4, isSystem: false }],
      nextCursor: null,
    });
    const tree = () => wrap(<SystemPage section="access" user={user} />);
    const view = render(tree());
    fireEvent.click(await screen.findByRole('button', { name: 'Operations' }));
    expect(new URLSearchParams(window.location.search).get('detail')).toBe('record-1');
    view.rerender(tree());
    expect(await screen.findByRole('dialog', { name: 'Operations' })).toBeInTheDocument();
    expect(getSystemDetail).toHaveBeenCalledWith('roles', 'record-1', expect.any(AbortSignal));
  });
  it('validates a branch form locally, then sends its exact values', async () => {
    const closed = vi.fn();
    render(wrap(<AccessDialog action="createBranch" user={user} locale="en" onClose={closed} />));
    fireEvent.click(screen.getByRole('button', { name: getAcademyCopy('en').save }));
    expect(executeAccessAction).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /Name/ })).toHaveAttribute('aria-invalid', 'true'),
    );
    fireEvent.change(screen.getByRole('textbox', { name: /Name/ }), {
      target: { value: 'Alexandria' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /Code/ }), { target: { value: 'ALEX' } });
    fireEvent.click(screen.getByRole('button', { name: getAcademyCopy('en').save }));
    await waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
    expect(executeAccessAction).toHaveBeenCalledWith(
      'createBranch',
      expect.objectContaining({ name: 'Alexandria', code: 'ALEX' }),
      undefined,
    );
  });
  it('keeps status selection inside its dialog and excludes self suspension', async () => {
    render(
      wrap(
        <AccessDialog
          action="editUser"
          item={{ id: user.id, status: 'ACTIVE', version: 4 }}
          user={user}
          locale="en"
          onClose={vi.fn()}
        />,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: /Status/ }));
    expect(screen.getByRole('button', { name: /Status/ })).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  it('renders the real WhatsApp status without fetching/exposing pairing credentials automatically', async () => {
    window.history.replaceState(null, '', '/ar/whatsapp');
    render(
      wrap(
        <WhatsappPage
          user={{ ...user, permissions: [{ code: 'messaging.otp.read', scopes: ['O'] }] }}
        />,
      ),
    );
    expect(await screen.findByText('متوقفة')).toBeInTheDocument();
    expect(readChannel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'ربط القناة' })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /رمز/ })).not.toBeInTheDocument();
  });
});
