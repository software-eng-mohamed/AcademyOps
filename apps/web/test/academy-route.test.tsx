import { describe, expect, it, vi } from 'vitest';
import { academySections } from '@/api/academy/models';
import { AcademyRoute } from '@/features/academy/academy-route';

const { readUser, redirect } = vi.hoisted(() => ({
  readUser: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock('@/api/server/current-user', () => ({ readCurrentUser: readUser }));
vi.mock('next/navigation', () => ({ redirect }));
vi.mock('@/features/academy/academy-page', () => ({ AcademyPage: () => null }));
vi.mock('@/features/dashboard/overview/overview-unavailable', () => ({
  OverviewUnavailable: 'unavailable',
}));

const owner = {
  id: 'owner-1',
  roles: [{ code: 'OWNER', name: 'Owner' }],
  permissions: [
    'leads.read',
    'students.read_basic',
    'students.registration.manage',
    'enrollments.read',
    'academic.catalog.read',
  ].map((code) => ({ code, scopes: ['O'] })),
};

describe('owner Academy route access', () => {
  it.each(academySections)('allows an authorized owner to open %s', async (section) => {
    readUser.mockResolvedValue(owner);
    const page = await AcademyRoute({ section, params: Promise.resolve({ locale: 'en' }) });
    expect(page?.type).not.toBe('unavailable');
  });

  it('requires authentication and retains the requested locale', async () => {
    readUser.mockResolvedValue(null);
    await expect(
      AcademyRoute({ section: 'students', params: Promise.resolve({ locale: 'ar' }) }),
    ).rejects.toThrow('redirect:/ar/login');
  });

  it('blocks unfinished staff roles and owners without the required grant', async () => {
    readUser.mockResolvedValue({ ...owner, roles: [{ code: 'STUDENT', name: 'Student' }] });
    expect(
      (await AcademyRoute({ section: 'students', params: Promise.resolve({ locale: 'en' }) }))
        ?.type,
    ).toBe('unavailable');
    readUser.mockResolvedValue({ ...owner, permissions: [] });
    expect(
      (await AcademyRoute({ section: 'students', params: Promise.resolve({ locale: 'en' }) }))
        ?.type,
    ).toBe('unavailable');
  });
});
