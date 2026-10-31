import { Suspense } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AcademyRoute } from '@/features/academy/academy-route';
import { getVisibleNavigation } from '@/features/dashboard/navigation';
import { ManagementRoute } from '@/features/management/management-route';
import { receptionUser } from './reception-user.fixture';

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

describe('Reception shared workspace access', () => {
  it('enables the ten shipped destinations without attendance entry, registration approval or finance administration', () => {
    const items = getVisibleNavigation(receptionUser);
    expect(items.map((item) => item.key)).toEqual([
      'dashboard',
      'leads',
      'students',
      'enrollments',
      'programs',
      'cohorts',
      'resources',
      'sessions',
      'certificates',
      'businessAccounts',
    ]);
    expect(items.every((item) => item.available)).toBe(true);
  });
  it.each(['leads', 'students', 'enrollments', 'programs', 'cohorts', 'resources'] as const)(
    'opens %s with actual branch grants, rejects self-only scopes',
    async (section) => {
      readUser.mockResolvedValue(receptionUser);
      expect(
        (await AcademyRoute({ section, params: Promise.resolve({ locale: 'ar' }) }))?.type,
      ).toBe(Suspense);
      readUser.mockResolvedValue({
        ...receptionUser,
        permissions: receptionUser.permissions.map((p) => ({ ...p, scopes: ['S'] })),
      });
      expect(
        (await AcademyRoute({ section, params: Promise.resolve({ locale: 'ar' }) }))?.type,
      ).toBe('unavailable');
    },
  );
  it.each(['sessions', 'certificates', 'businessAccounts'] as const)(
    'opens shared %s and fails closed without grants',
    async (section) => {
      readUser.mockResolvedValue(receptionUser);
      expect(
        (await ManagementRoute({ section, params: Promise.resolve({ locale: 'en' }) }))?.type,
      ).toBe(Suspense);
      readUser.mockResolvedValue({ ...receptionUser, permissions: [] });
      expect(
        (await ManagementRoute({ section, params: Promise.resolve({ locale: 'en' }) }))?.type,
      ).toBe('unavailable');
    },
  );
  it.each(['attendance', 'finance', 'payments', 'documents', 'reports'] as const)(
    'denies a direct %s URL',
    async (section) => {
      readUser.mockResolvedValue(receptionUser);
      expect(
        (await ManagementRoute({ section, params: Promise.resolve({ locale: 'en' }) }))?.type,
      ).toBe('unavailable');
    },
  );
  it('does not grant registration approval', async () => {
    readUser.mockResolvedValue(receptionUser);
    expect(
      (await AcademyRoute({ section: 'registrations', params: Promise.resolve({ locale: 'en' }) }))
        ?.type,
    ).toBe('unavailable');
  });
});
