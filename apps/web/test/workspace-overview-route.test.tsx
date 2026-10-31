import {
  workspaceOverviewRequirements,
  workspaceOverviewRoles,
} from '@academyops/api-client/workspace-overview';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from '@/app/[locale]/(dashboard)/dashboard/page';
import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { workspaceFixture } from './workspace-overview.fixture';

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
vi.mock('@/features/dashboard/overview/dashboard-overview', () => ({
  DashboardOverview: () => null,
}));
vi.mock('@/features/dashboard/overview/sales-overview', () => ({ SalesOverview: () => null }));
vi.mock('@/features/dashboard/overview/workspace-overview', () => ({
  WorkspaceOverviewPage: () => null,
}));
vi.mock('@/features/dashboard/overview/overview-unavailable', () => ({
  OverviewUnavailable: () => null,
}));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
const base: DashboardUser = {
  id: 'user-1',
  name: 'Samir',
  organization: { name: 'ACADEMYOPS' },
  branches: [],
  roles: [],
  permissions: [],
};
const renderPage = () => DashboardPage({ params: Promise.resolve({ locale: 'en' }) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.workspace.mockImplementation((role) => Promise.resolve(workspaceFixture(role)));
});
describe('All role overview routing', () => {
  it.each(workspaceOverviewRoles)('fetches only the scoped workspace for %s', async (role) => {
    mocks.user.mockResolvedValue({
      ...base,
      roles: [{ code: role, name: role }],
      permissions: workspaceOverviewRequirements[role].map(([code, scopes]) => ({ code, scopes })),
    });
    const page = await renderPage();
    expect(mocks.workspace).toHaveBeenCalledExactlyOnceWith(role);
    expect(mocks.owner).not.toHaveBeenCalled();
    expect(mocks.sales).not.toHaveBeenCalled();
    expect(page?.props).toMatchObject({ role, userId: base.id, userName: base.name });
  });
  it.each(workspaceOverviewRoles)('does not authorize %s by role name alone', async (role) => {
    mocks.user.mockResolvedValue({ ...base, roles: [{ code: role, name: role }] });
    await renderPage();
    expect(mocks.workspace).not.toHaveBeenCalled();
    expect(mocks.owner).not.toHaveBeenCalled();
    expect(mocks.sales).not.toHaveBeenCalled();
  });
  it('does not fetch any overview for the no-grant account', async () => {
    mocks.user.mockResolvedValue(base);
    await renderPage();
    expect(mocks.workspace).not.toHaveBeenCalled();
    expect(mocks.owner).not.toHaveBeenCalled();
    expect(mocks.sales).not.toHaveBeenCalled();
  });
  it('uses the existing primary-role priority for multi-role users', async () => {
    mocks.user.mockResolvedValue({
      ...base,
      roles: [
        { code: 'OWNER', name: 'Owner' },
        { code: 'STUDENT', name: 'Student' },
      ],
      permissions: [{ code: 'reports.operations.read', scopes: ['O'] }],
    });
    await renderPage();
    expect(mocks.owner).toHaveBeenCalledOnce();
    expect(mocks.workspace).not.toHaveBeenCalled();
  });
});
