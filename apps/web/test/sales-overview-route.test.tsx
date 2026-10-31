import { beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from '@/app/[locale]/(dashboard)/dashboard/page';
import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { salesOverviewFixture } from './sales-overview.fixture';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  owner: vi.fn(),
  sales: vi.fn(),
  workspace: vi.fn(),
}));
vi.mock('@/api/server/current-user', () => ({ readCurrentUser: mocks.user }));
vi.mock('@/api/server/dashboard', () => ({ readDashboardOverview: mocks.owner }));
vi.mock('@/api/server/sales-overview', () => ({ readSalesOverview: mocks.sales }));
vi.mock('@/api/server/workspace-overview', () => ({ readWorkspaceOverview: mocks.workspace }));
vi.mock('@/features/dashboard/overview/workspace-overview', () => ({
  WorkspaceOverviewPage: () => null,
}));
vi.mock('@/features/dashboard/overview/dashboard-overview', () => ({
  DashboardOverview: () => null,
}));
vi.mock('@/features/dashboard/overview/sales-overview', () => ({ SalesOverview: () => null }));
vi.mock('@/features/dashboard/overview/overview-unavailable', () => ({
  OverviewUnavailable: () => null,
}));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

const user = (
  role: string,
  permission: DashboardUser['permissions'][number]['code'] = 'leads.read',
): DashboardUser => ({
  id: 'sales-user',
  name: 'Samir',
  organization: { name: 'ACADEMYOPS' },
  branches: [],
  roles: [{ code: role, name: role }],
  permissions: [{ code: permission, scopes: ['A'] }],
});
const renderPage = () => DashboardPage({ params: Promise.resolve({ locale: 'en' }) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.sales.mockResolvedValue(salesOverviewFixture());
});

describe('Role-specific overview routing', () => {
  it('fetches only the sales endpoint for Sales', async () => {
    mocks.user.mockResolvedValue(user('SALES'));
    const page = await renderPage();
    expect(mocks.sales).toHaveBeenCalledOnce();
    expect(mocks.owner).not.toHaveBeenCalled();
    expect(page?.props).toMatchObject({ userId: 'sales-user', userName: 'Samir' });
  });
  it('preserves the Owner overview and does not fetch sales', async () => {
    mocks.user.mockResolvedValue(user('OWNER', 'reports.operations.read'));
    await renderPage();
    expect(mocks.owner).toHaveBeenCalledOnce();
    expect(mocks.sales).not.toHaveBeenCalled();
  });
  it.each(['STUDENT', 'OTP_OPERATOR', 'NO_GRANT', 'OPERATIONS', 'ACCOUNTS'])(
    'does not request sales data for %s',
    async (role) => {
      mocks.user.mockResolvedValue(user(role));
      await renderPage();
      expect(mocks.sales).not.toHaveBeenCalled();
    },
  );
  it('does not fetch by role name alone without the required grant', async () => {
    mocks.user.mockResolvedValue(user('SALES', 'reports.operations.read'));
    await renderPage();
    expect(mocks.sales).not.toHaveBeenCalled();
  });
  it('redirects signed-out users before any dashboard request', async () => {
    mocks.user.mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow('redirect:/en/login');
    expect(mocks.sales).not.toHaveBeenCalled();
    expect(mocks.owner).not.toHaveBeenCalled();
  });
});
