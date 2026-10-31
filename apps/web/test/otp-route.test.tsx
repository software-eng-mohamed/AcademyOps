import { Suspense } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { getVisibleNavigation } from '@/features/dashboard/navigation';
import { SystemRoute } from '@/features/system/system-route';
import { otpUser } from './otp-user.fixture';

const { readUser } = vi.hoisted(() => ({ readUser: vi.fn() }));
vi.mock('@/api/server/current-user', () => ({ readCurrentUser: readUser }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(path);
  },
}));
vi.mock('@/features/system/system-page', () => ({ SystemPage: () => null }));
vi.mock('@/features/system/whatsapp-page', () => ({ WhatsappPage: () => null }));
vi.mock('@/features/dashboard/overview/overview-unavailable', () => ({
  OverviewUnavailable: 'unavailable',
}));

describe('OTP operator workspace access', () => {
  it('enables only the overview and WhatsApp destinations with the actual default grants', () => {
    const items = getVisibleNavigation(otpUser);
    expect(items.map(({ key }) => key)).toEqual(['dashboard', 'whatsapp']);
    expect(items.every(({ available }) => available)).toBe(true);
  });
  it.each(['en', 'ar'])('opens WhatsApp in %s for Owner and OTP Operator', async (locale) => {
    for (const role of ['OWNER', 'OTP_OPERATOR']) {
      readUser.mockResolvedValue({ ...otpUser, roles: [{ code: role, name: role }] });
      expect(
        (await SystemRoute({ section: 'whatsapp', params: Promise.resolve({ locale }) }))?.type,
      ).toBe(Suspense);
    }
  });
  it.each(['access', 'imports', 'audit', 'legacyArchive'] as const)(
    'does not expose %s to the operator',
    async (section) => {
      readUser.mockResolvedValue(otpUser);
      expect(
        (await SystemRoute({ section, params: Promise.resolve({ locale: 'en' }) }))?.type,
      ).toBe('unavailable');
    },
  );
  it.each([[], ['S'], ['B'], ['A']])(
    'requires organization-scoped channel read, scopes=%j',
    async (...scopes) => {
      readUser.mockResolvedValue({
        ...otpUser,
        permissions: [{ code: 'messaging.otp.read', scopes }],
      });
      expect(
        (await SystemRoute({ section: 'whatsapp', params: Promise.resolve({ locale: 'en' }) }))
          ?.type,
      ).toBe('unavailable');
    },
  );
  it('does not enable WhatsApp for another primary role merely through a matching grant', async () => {
    readUser.mockResolvedValue({ ...otpUser, roles: [{ code: 'STUDENT', name: 'Student' }] });
    expect(
      (await SystemRoute({ section: 'whatsapp', params: Promise.resolve({ locale: 'en' }) }))?.type,
    ).toBe('unavailable');
  });
  it('redirects anonymous visitors to localized login', async () => {
    readUser.mockResolvedValue(null);
    await expect(
      SystemRoute({ section: 'whatsapp', params: Promise.resolve({ locale: 'ar' }) }),
    ).rejects.toThrow('/ar/login');
  });
});
