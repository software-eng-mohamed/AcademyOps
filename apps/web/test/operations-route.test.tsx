import { describe, expect, it, vi } from 'vitest';
import { AcademyRoute } from '@/features/academy/academy-route';
import { getVisibleNavigation } from '@/features/dashboard/navigation';
import { ManagementRoute } from '@/features/management/management-route';
import { operationsUser } from './operations-user.fixture';

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
describe('Operations shared workspace access', () => {
  it('makes all ten default navigation destinations usable and hides Owner-only areas', () => {
    const items = getVisibleNavigation(operationsUser);
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
      'businessAccounts',
    ]);
    expect(items.every((item) => item.available)).toBe(true);
  });
  it.each(['students', 'enrollments', 'programs', 'cohorts', 'resources'] as const)(
    'shares the %s page with the real Operations grants',
    async (section) => {
      readUser.mockResolvedValue(operationsUser);
      expect(
        (await AcademyRoute({ section, params: Promise.resolve({ locale: 'ar' }) }))?.type,
      ).not.toBe('unavailable');
      readUser.mockResolvedValue({
        ...operationsUser,
        permissions: operationsUser.permissions.map((permission) => ({
          ...permission,
          scopes: ['S'],
        })),
      });
      expect(
        (await AcademyRoute({ section, params: Promise.resolve({ locale: 'ar' }) }))?.type,
      ).toBe('unavailable');
    },
  );
  it.each(['sessions', 'attendance', 'certificates', 'businessAccounts'] as const)(
    'shares the %s management page without requiring Owner scopes',
    async (section) => {
      readUser.mockResolvedValue(operationsUser);
      expect(
        (await ManagementRoute({ section, params: Promise.resolve({ locale: 'en' }) }))?.type,
      ).not.toBe('unavailable');
      readUser.mockResolvedValue({ ...operationsUser, permissions: [] });
      expect(
        (await ManagementRoute({ section, params: Promise.resolve({ locale: 'en' }) }))?.type,
      ).toBe('unavailable');
    },
  );
  it.each(['finance', 'payments', 'documents', 'reports'] as const)(
    'does not open the Owner-only %s surface by typing its URL',
    async (section) => {
      readUser.mockResolvedValue(operationsUser);
      expect(
        (await ManagementRoute({ section, params: Promise.resolve({ locale: 'en' }) }))?.type,
      ).toBe('unavailable');
    },
  );
  it.each(['leads', 'registrations'] as const)(
    'keeps %s outside the Operations role',
    async (section) => {
      readUser.mockResolvedValue(operationsUser);
      expect(
        (await AcademyRoute({ section, params: Promise.resolve({ locale: 'en' }) }))?.type,
      ).toBe('unavailable');
    },
  );
});
