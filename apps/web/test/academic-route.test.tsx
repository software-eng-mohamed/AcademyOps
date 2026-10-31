import { describe, expect, it, vi } from 'vitest';
import { AcademyRoute } from '@/features/academy/academy-route';
import { getVisibleNavigation } from '@/features/dashboard/navigation';
import { ManagementRoute } from '@/features/management/management-route';
import { academicUser } from './academic-user.fixture';

const { readUser } = vi.hoisted(() => ({ readUser: vi.fn() }));
vi.mock('@/api/server/current-user', () => ({ readCurrentUser: readUser }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock('@/features/academy/academy-page', () => ({ AcademyPage: () => null }));
vi.mock('@/features/management/management-page', () => ({ ManagementPage: () => null }));
vi.mock('@/features/dashboard/overview/overview-unavailable', () => ({
  OverviewUnavailable: 'unavailable',
}));

describe('Academic shared workspace access', () => {
  it('enables exactly the nine shipped destinations, without finance or Owner administration', () => {
    const items = getVisibleNavigation(academicUser);
    expect(items.map((item) => item.key)).toEqual([
      'dashboard',
      'students',
      'enrollments',
      'programs',
      'cohorts',
      'resources',
      'sessions',
      'attendance',
      'certificates',
    ]);
    expect(items.every((item) => item.available)).toBe(true);
  });
  it.each(['students', 'enrollments', 'programs', 'cohorts', 'resources'] as const)(
    'shares %s with the actual O/B grants, but rejects self-only scopes',
    async (section) => {
      readUser.mockResolvedValue(academicUser);
      expect(
        (await AcademyRoute({ section, params: Promise.resolve({ locale: 'ar' }) }))?.type,
      ).not.toBe('unavailable');
      readUser.mockResolvedValue({
        ...academicUser,
        permissions: academicUser.permissions.map((p) => ({ ...p, scopes: ['S'] })),
      });
      expect(
        (await AcademyRoute({ section, params: Promise.resolve({ locale: 'ar' }) }))?.type,
      ).toBe('unavailable');
    },
  );
  it.each(['sessions', 'attendance', 'certificates'] as const)(
    'shares %s without adding permissions and fails closed after grant removal',
    async (section) => {
      readUser.mockResolvedValue(academicUser);
      expect(
        (await ManagementRoute({ section, params: Promise.resolve({ locale: 'en' }) }))?.type,
      ).not.toBe('unavailable');
      readUser.mockResolvedValue({ ...academicUser, permissions: [] });
      expect(
        (await ManagementRoute({ section, params: Promise.resolve({ locale: 'en' }) }))?.type,
      ).toBe('unavailable');
    },
  );
  it.each(['businessAccounts', 'finance', 'payments', 'documents', 'reports'] as const)(
    'does not open %s through a direct URL',
    async (section) => {
      readUser.mockResolvedValue(academicUser);
      expect(
        (await ManagementRoute({ section, params: Promise.resolve({ locale: 'en' }) }))?.type,
      ).toBe('unavailable');
    },
  );
  it.each(['leads', 'registrations'] as const)('keeps %s unavailable', async (section) => {
    readUser.mockResolvedValue(academicUser);
    expect((await AcademyRoute({ section, params: Promise.resolve({ locale: 'en' }) }))?.type).toBe(
      'unavailable',
    );
  });
});
