import { Suspense } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AcademyRoute } from '@/features/academy/academy-route';
import { getVisibleNavigation } from '@/features/dashboard/navigation';
import { ManagementRoute } from '@/features/management/management-route';
import { trainerUser } from './trainer-user.fixture';

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

describe('Trainer shared routes with actual shipped grants', () => {
  it('enables nine destinations and no finance or administration workspaces', () => {
    const items = getVisibleNavigation(trainerUser);
    expect(items.map(({ key }) => key)).toEqual([
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
    expect(items.every(({ available }) => available)).toBe(true);
  });
  it.each(['students', 'enrollments', 'programs', 'cohorts', 'resources'] as const)(
    'opens %s only with staff-scope permission',
    async (section) => {
      readUser.mockResolvedValue(trainerUser);
      expect(
        (await AcademyRoute({ section, params: Promise.resolve({ locale: 'ar' }) }))?.type,
      ).toBe(Suspense);
      for (const scopes of [[], ['S'], ['B'], ['O']]) {
        readUser.mockResolvedValue({
          ...trainerUser,
          permissions: trainerUser.permissions.map((p) => ({ ...p, scopes })),
        });
        expect(
          (await AcademyRoute({ section, params: Promise.resolve({ locale: 'ar' }) }))?.type,
        ).toBe('unavailable');
      }
    },
  );
  it.each(['sessions', 'attendance', 'certificates'] as const)(
    'opens %s only with staff-scope permission',
    async (section) => {
      readUser.mockResolvedValue(trainerUser);
      expect(
        (await ManagementRoute({ section, params: Promise.resolve({ locale: 'en' }) }))?.type,
      ).toBe(Suspense);
      for (const scopes of [[], ['S'], ['B'], ['O']]) {
        readUser.mockResolvedValue({
          ...trainerUser,
          permissions: trainerUser.permissions.map((p) => ({ ...p, scopes })),
        });
        expect(
          (await ManagementRoute({ section, params: Promise.resolve({ locale: 'en' }) }))?.type,
        ).toBe('unavailable');
      }
    },
  );
  it.each(['finance', 'payments', 'documents', 'businessAccounts', 'reports'] as const)(
    'denies direct %s access',
    async (section) => {
      readUser.mockResolvedValue(trainerUser);
      expect(
        (await ManagementRoute({ section, params: Promise.resolve({ locale: 'en' }) }))?.type,
      ).toBe('unavailable');
    },
  );
  it.each(['leads', 'registrations'] as const)('denies %s', async (section) => {
    readUser.mockResolvedValue(trainerUser);
    expect((await AcademyRoute({ section, params: Promise.resolve({ locale: 'en' }) }))?.type).toBe(
      'unavailable',
    );
  });
});
