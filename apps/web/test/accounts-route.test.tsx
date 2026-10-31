import { Suspense } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AcademyRoute } from '@/features/academy/academy-route';
import { getVisibleNavigation } from '@/features/dashboard/navigation';
import { ManagementRoute } from '@/features/management/management-route';
import { accountsUser } from './accounts-user.fixture';

const { readUser } = vi.hoisted(() => ({ readUser: vi.fn() }));
vi.mock('@/api/server/current-user', () => ({ readCurrentUser: readUser }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(path);
  },
}));
vi.mock('@/features/academy/academy-page', () => ({ AcademyPage: () => null }));
vi.mock('@/features/management/management-page', () => ({ ManagementPage: () => null }));
vi.mock('@/features/dashboard/overview/overview-unavailable', () => ({
  OverviewUnavailable: 'unavailable',
}));

describe('Accounts uses the shared staff workspace with actual default grants', () => {
  it('enables ten destinations without expanding the Accounts grants', () => {
    const items = getVisibleNavigation(accountsUser);
    expect(items.map(({ key }) => key)).toEqual([
      'dashboard',
      'students',
      'enrollments',
      'programs',
      'cohorts',
      'resources',
      'sessions',
      'finance',
      'payments',
      'documents',
    ]);
    expect(items.every(({ available }) => available)).toBe(true);
  });
  it.each(['students', 'enrollments', 'programs', 'cohorts', 'resources'] as const)(
    'opens shared %s and rejects self-only grants',
    async (section) => {
      readUser.mockResolvedValue(accountsUser);
      expect(
        (await AcademyRoute({ section, params: Promise.resolve({ locale: 'ar' }) }))?.type,
      ).toBe(Suspense);
      readUser.mockResolvedValue({
        ...accountsUser,
        permissions: accountsUser.permissions.map((p) => ({ ...p, scopes: ['S'] })),
      });
      expect(
        (await AcademyRoute({ section, params: Promise.resolve({ locale: 'ar' }) }))?.type,
      ).toBe('unavailable');
    },
  );
  it.each(['sessions', 'finance', 'payments', 'documents'] as const)(
    'opens shared %s and fails closed without permissions',
    async (section) => {
      readUser.mockResolvedValue(accountsUser);
      expect(
        (await ManagementRoute({ section, params: Promise.resolve({ locale: 'en' }) }))?.type,
      ).toBe(Suspense);
      readUser.mockResolvedValue({ ...accountsUser, permissions: [] });
      expect(
        (await ManagementRoute({ section, params: Promise.resolve({ locale: 'en' }) }))?.type,
      ).toBe('unavailable');
      readUser.mockResolvedValue({
        ...accountsUser,
        permissions: accountsUser.permissions.map((p) => ({ ...p, scopes: ['A'] })),
      });
      expect(
        (await ManagementRoute({ section, params: Promise.resolve({ locale: 'en' }) }))?.type,
      ).toBe('unavailable');
    },
  );
  it.each(['attendance', 'certificates', 'businessAccounts', 'reports'] as const)(
    'keeps %s unavailable even when opening the URL directly',
    async (section) => {
      readUser.mockResolvedValue(accountsUser);
      expect(
        (await ManagementRoute({ section, params: Promise.resolve({ locale: 'en' }) }))?.type,
      ).toBe('unavailable');
    },
  );
  it.each(['leads', 'registrations'] as const)('does not grant %s access', async (section) => {
    readUser.mockResolvedValue(accountsUser);
    expect((await AcademyRoute({ section, params: Promise.resolve({ locale: 'en' }) }))?.type).toBe(
      'unavailable',
    );
  });
});
