import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { PhoneOtpService } from '../src/iam/auth/phone-otp.service';

const actionKey = 'action-token-encryption-at-least-32-bytes';
const phonePepper = 'phone-otp-pepper-at-least-32-bytes-long';
const sessionPepper = 'session-pepper-at-least-32-bytes-long';

function createMocks() {
  const config = {
    getOrThrow: vi.fn((key: string): string => {
      if (key === 'PHONE_OTP_PEPPER') return phonePepper;
      if (key === 'ACTION_TOKEN_ENCRYPTION_KEY') return actionKey;
      if (key === 'SESSION_PEPPER') return sessionPepper;
      throw new Error(`Unexpected config key: ${key}`);
    }),
  };

  const audit = { write: vi.fn().mockResolvedValue(undefined) };
  const outbox = { add: vi.fn().mockResolvedValue(undefined) };
  const mfa = { verifyForLogin: vi.fn().mockResolvedValue('NOT_CONFIGURED') };

  return { config, audit, outbox, mfa };
}

describe('PhoneOtpService verifyOtp failure branches', () => {
  it('verifyOtp caps wrong code attempts at 5 and revokes challenge', async () => {
    const { config, audit, outbox, mfa } = createMocks();
    const org = { id: 'org-1', code: 'ACADEMY' };
    const ident = { id: 'ident-1', userId: 'user-1', verifiedAt: null };
    const user = { id: 'user-1', organizationId: 'org-1', status: 'ACTIVE' };
    const challenge = {
      id: 'challenge-1',
      organizationId: 'org-1',
      userId: 'user-1',
      normalizedPhone: '+201234567890',
      codeHash: 'invalid-hash',
      expiresAt: new Date(Date.now() + 300000),
      attempts: 4,
    };

    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      userLoginIdentifier: {
        findFirst: vi.fn().mockResolvedValue(ident),
        update: vi.fn().mockResolvedValue({}),
      },
      user: { findFirst: vi.fn().mockResolvedValue(user) },
      phoneOtpChallenge: {
        findFirst: vi.fn().mockResolvedValue(challenge),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const prisma = {
      organization: { findUnique: vi.fn().mockResolvedValue(org) },
      userLoginIdentifier: { findFirst: vi.fn().mockResolvedValue(ident) },
      user: { findFirst: vi.fn().mockResolvedValue(user) },
      serializable: vi
        .fn()
        .mockImplementation((fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    };

    const service = new PhoneOtpService(
      prisma as never,
      config as never,
      mfa as never,
      audit as never,
      outbox as never,
      {} as never,
    );

    await expect(
      service.verifyOtp(
        { organizationCode: 'ACADEMY', phone: '+201234567890', code: '123456' },
        'corr-3',
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(tx.phoneOtpChallenge.update).toHaveBeenCalledWith({
      where: { id: 'challenge-1' },
      data: { attempts: { increment: 1 }, revokedAt: expect.any(Date) as unknown },
    });
  });

  it('verifyOtp revokes expired challenge and rejects verification', async () => {
    const { config, audit, outbox, mfa } = createMocks();
    const org = { id: 'org-1', code: 'ACADEMY' };
    const ident = { id: 'ident-1', userId: 'user-1', verifiedAt: null };
    const user = { id: 'user-1', organizationId: 'org-1', status: 'ACTIVE' };
    const challenge = {
      id: 'challenge-1',
      organizationId: 'org-1',
      userId: 'user-1',
      normalizedPhone: '+201234567890',
      codeHash: 'hash-123456',
      expiresAt: new Date(Date.now() - 1000),
      attempts: 0,
    };

    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      userLoginIdentifier: {
        findFirst: vi.fn().mockResolvedValue(ident),
        update: vi.fn().mockResolvedValue({}),
      },
      user: { findFirst: vi.fn().mockResolvedValue(user) },
      phoneOtpChallenge: {
        findFirst: vi.fn().mockResolvedValue(challenge),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const prisma = {
      organization: { findUnique: vi.fn().mockResolvedValue(org) },
      userLoginIdentifier: { findFirst: vi.fn().mockResolvedValue(ident) },
      user: { findFirst: vi.fn().mockResolvedValue(user) },
      serializable: vi
        .fn()
        .mockImplementation((fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    };

    const service = new PhoneOtpService(
      prisma as never,
      config as never,
      mfa as never,
      audit as never,
      outbox as never,
      {} as never,
    );

    await expect(
      service.verifyOtp(
        { organizationCode: 'ACADEMY', phone: '+201234567890', code: '123456' },
        'corr-4',
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(tx.phoneOtpChallenge.update).toHaveBeenCalledWith({
      where: { id: 'challenge-1' },
      data: { revokedAt: expect.any(Date) as unknown },
    });
  });
});
