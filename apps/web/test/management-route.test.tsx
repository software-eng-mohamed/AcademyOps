import { describe, expect, it, vi } from 'vitest';
import { managementSections, sectionPermissions } from '@/features/management/config';
import { ManagementRoute } from '@/features/management/management-route';

const { readUser } = vi.hoisted(() => ({ readUser: vi.fn() }));
vi.mock('@/api/server/current-user', () => ({ readCurrentUser: readUser }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock('@/features/management/management-page', () => ({ ManagementPage: () => null }));
vi.mock('@/features/dashboard/overview/overview-unavailable', () => ({
  OverviewUnavailable: 'unavailable',
}));
const owner = {
  roles: [{ code: 'OWNER', name: 'Owner' }],
  permissions: [...new Set(Object.values(sectionPermissions).flat())].map((code) => ({
    code,
    scopes: ['O'],
  })),
};
describe('management route access', () => {
  it.each(managementSections)(
    'authorizes %s with route permissions and rejects unavailable staff workspaces',
    async (section) => {
      readUser.mockResolvedValue(owner);
      expect(
        (await ManagementRoute({ section, params: Promise.resolve({ locale: 'en' }) }))?.type,
      ).not.toBe('unavailable');
      readUser.mockResolvedValue({ ...owner, permissions: [] });
      expect(
        (await ManagementRoute({ section, params: Promise.resolve({ locale: 'en' }) }))?.type,
      ).toBe('unavailable');
      readUser.mockResolvedValue({
        ...owner,
        roles: [{ code: 'OTP_OPERATOR', name: 'OTP Operator' }],
      });
      expect(
        (await ManagementRoute({ section, params: Promise.resolve({ locale: 'en' }) }))?.type,
      ).toBe('unavailable');
    },
  );
  it('redirects an anonymous visitor to the locale login', async () => {
    readUser.mockResolvedValue(null);
    await expect(
      ManagementRoute({ section: 'payments', params: Promise.resolve({ locale: 'ar' }) }),
    ).rejects.toThrow('redirect:/ar/login');
  });
});
