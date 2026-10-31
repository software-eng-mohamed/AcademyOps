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

describe('PhoneOtpService verifyOtp success & MFA branches', () => {
  it('verifyOtp succeeds: consumes challenge, verifies identifier, creates session, audit and outbox', async () => {
    const { config, audit, outbox, mfa } = createMocks();
    const org = { id: 'org-1', code: 'ACADEMY' };
    const ident = { id: 'ident-1', userId: 'user-1', verifiedAt: null };
    const user = {
      id: 'user-1',
      organizationId: 'org-1',
      status: 'ACTIVE',
      mustChangePassword: false,
    };

    const { createHash } = await import('node:crypto');
    const validHash = createHash('sha256').update(`654321:${phonePepper}`).digest('hex');

    const challenge = {
      id: 'challenge-1',
      organizationId: 'org-1',
      userId: 'user-1',
      normalizedPhone: '+201234567890',
      codeHash: validHash,
      expiresAt: new Date(Date.now() + 300000),
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
      userRoleAssignment: { findMany: vi.fn().mockResolvedValue([]) },
      role: { findMany: vi.fn().mockResolvedValue([]) },
      userSession: { create: vi.fn().mockResolvedValue({}) },
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

    const result = await service.verifyOtp(
      { organizationCode: 'ACADEMY', phone: '+201234567890', code: '654321' },
      'corr-5',
    );

    expect(result.mfaSetupRequired).toBe(false);
    expect(result.passwordChangeRequired).toBe(false);
    expect(tx.phoneOtpChallenge.update).toHaveBeenCalledWith({
      where: { id: 'challenge-1' },
      data: { consumedAt: expect.any(Date) as unknown },
    });
    expect(tx.userLoginIdentifier.update).toHaveBeenCalledWith({
      where: { id: 'ident-1' },
      data: { verifiedAt: expect.any(Date) as unknown },
    });
    expect(tx.userSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
        tokenHash: expect.any(String) as unknown as string,
        csrfSecretHash: expect.any(String) as unknown as string,
        expiresAt: expect.any(Date) as unknown as Date,
      }) as unknown,
    });
    expect(audit.write).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: 'user.phone_otp.verify' }),
    );
    expect(outbox.add).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ type: 'security.phone_otp_verified' }),
    );
  });

  it('verifyOtp enforces MFA for Owner/Accounts roles and calls mfa.verifyForLogin', async () => {
    const { config, audit, outbox, mfa } = createMocks();
    mfa.verifyForLogin.mockRejectedValue(
      new UnauthorizedException({ code: 'MFA_REQUIRED', messageKey: 'auth.mfaRequired' }),
    );

    const org = { id: 'org-1', code: 'ACADEMY' };
    const ident = { id: 'ident-1', userId: 'user-1', verifiedAt: new Date() };
    const user = {
      id: 'user-1',
      organizationId: 'org-1',
      status: 'ACTIVE',
      mustChangePassword: false,
    };

    const { createHash } = await import('node:crypto');
    const validHash = createHash('sha256').update(`111222:${phonePepper}`).digest('hex');

    const challenge = {
      id: 'challenge-1',
      organizationId: 'org-1',
      userId: 'user-1',
      normalizedPhone: '+201234567890',
      codeHash: validHash,
      expiresAt: new Date(Date.now() + 300000),
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
      userRoleAssignment: { findMany: vi.fn().mockResolvedValue([{ roleId: 'role-owner' }]) },
      role: { findMany: vi.fn().mockResolvedValue([{ code: 'OWNER' }]) },
      userSession: { create: vi.fn() },
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
        { organizationCode: 'ACADEMY', phone: '+201234567890', code: '111222' },
        'corr-6',
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(mfa.verifyForLogin).toHaveBeenCalledWith('org-1', 'user-1', undefined, undefined, tx);
    const assignmentCall = tx.userRoleAssignment.findMany.mock.calls[0]?.[0] as unknown as {
      where: { startsAt: { lte: Date }; OR: unknown[] };
      select: { roleId: boolean };
    };
    expect(assignmentCall.where.startsAt.lte).toBeInstanceOf(Date);
    expect(assignmentCall.where.OR).toHaveLength(2);
    expect(assignmentCall.select).toEqual({ roleId: true });
    const roleCall = tx.role.findMany.mock.calls[0]?.[0] as unknown as {
      where: { organizationId: string; id: { in: string[] } };
      select: { code: boolean };
    };
    expect(roleCall.where).toEqual({ organizationId: 'org-1', id: { in: ['role-owner'] } });
    expect(roleCall.select).toEqual({ code: true });
  });
});
