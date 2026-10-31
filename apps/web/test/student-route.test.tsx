import { Suspense } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AcademyRoute } from '@/features/academy/academy-route';
import { getVisibleNavigation } from '@/features/dashboard/navigation';
import { ManagementRoute } from '@/features/management/management-route';
import { StudentRoute } from '@/features/student/student-route';
import { studentUser } from './student-user.fixture';

const { readUser } = vi.hoisted(() => ({ readUser: vi.fn() }));
vi.mock('@/api/server/current-user', () => ({ readCurrentUser: readUser }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(path);
  },
}));
vi.mock('@/features/student/student-page', () => ({ StudentPage: () => null }));
vi.mock('@/features/academy/academy-page', () => ({ AcademyPage: () => null }));
vi.mock('@/features/management/management-page', () => ({ ManagementPage: () => null }));
vi.mock('@/features/dashboard/overview/overview-unavailable', () => ({
  OverviewUnavailable: 'unavailable',
}));
describe('Student self-only destinations', () => {
  it('enables exactly six personal destinations', () => {
    const items = getVisibleNavigation(studentUser);
    expect(items.map(({ key }) => key)).toEqual([
      'dashboard',
      'myLearning',
      'mySchedule',
      'myAttendance',
      'myFinance',
      'myCertificates',
    ]);
    expect(items.every(({ available }) => available)).toBe(true);
  });
  it.each(['learning', 'schedule', 'attendance', 'finance', 'certificates'] as const)(
    'requires Student S permission for %s',
    async (section) => {
      readUser.mockResolvedValue(studentUser);
      expect(
        (await StudentRoute({ section, params: Promise.resolve({ locale: 'ar' }) }))?.type,
      ).toBe(Suspense);
      for (const scopes of [[], ['O'], ['B'], ['A']]) {
        readUser.mockResolvedValue({
          ...studentUser,
          permissions: studentUser.permissions.map((p) => ({ ...p, scopes })),
        });
        expect(
          (await StudentRoute({ section, params: Promise.resolve({ locale: 'ar' }) }))?.type,
        ).toBe('unavailable');
      }
    },
  );
  it.each(['attendance', 'finance', 'certificates'] as const)(
    'routes shared %s URL to the personal workspace',
    async (section) => {
      readUser.mockResolvedValue(studentUser);
      expect(
        (await ManagementRoute({ section, params: Promise.resolve({ locale: 'en' }) }))?.type,
      ).toBe(StudentRoute);
    },
  );
  it.each(['students', 'enrollments', 'programs', 'cohorts', 'resources', 'leads'] as const)(
    'does not open the staff %s workspace',
    async (section) => {
      readUser.mockResolvedValue(studentUser);
      expect(
        (await AcademyRoute({ section, params: Promise.resolve({ locale: 'en' }) }))?.type,
      ).toBe('unavailable');
    },
  );
});
