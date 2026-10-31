import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { verify } from 'argon2';
import { decryptActionToken } from '../src/iam/auth/action-token';
import { PhoneOtpService } from '../src/iam/auth/phone-otp.service';

const actionKey = 'action-token-encryption-at-least-32-bytes';
const phonePepper = 'phone-otp-pepper-at-least-32-bytes-long';
const password = 'Strong-password-123!';

vi.mock('argon2', () => ({ verify: vi.fn() }));

function createMocks() {
  const config = {
    getOrThrow: vi.fn((key: string): string => {
      if (key === 'PHONE_OTP_PEPPER') return phonePepper;
      if (key === 'ACTION_TOKEN_ENCRYPTION_KEY') return actionKey;
      throw new Error(`Unexpected config key: ${key}`);
    }),
  };

  const audit = { write: vi.fn().mockResolvedValue(undefined) };
  const outbox = { add: vi.fn().mockResolvedValue(undefined) };
  const mfa = { verifyForLogin: vi.fn().mockResolvedValue('NOT_CONFIGURED') };

  return { config, audit, outbox, mfa };
}

describe('PhoneOtpService requestOtp', () => {
  beforeEach(() => vi.clearAllMocks());

  it('performs a dummy password check and rejects unknown accounts generically', async () => {
    vi.mocked(verify).mockResolvedValue(false);
    const { config, audit, outbox, mfa } = createMocks();
    const prisma = {
      organization: { findUnique: vi.fn().mockResolvedValue(null) },
      userLoginIdentifier: { findFirst: vi.fn() },
      user: { findFirst: vi.fn() },
      serializable: vi.fn(),
    };

    const service = new PhoneOtpService(
      prisma as never,
      config as never,
      mfa as never,
      audit as never,
      outbox as never,
      { assertAvailable: vi.fn().mockResolvedValue(undefined) } as never,
    );

    await expect(
      service.requestOtp({ organizationCode: 'UNKNOWN', password, phone: '+1234567890' }, 'corr-1'),
    ).rejects.toMatchObject({ status: 401 });

    expect(verify).toHaveBeenCalledOnce();
    expect(prisma.serializable).not.toHaveBeenCalled();
    expect(audit.write).not.toHaveBeenCalled();
  });

  it('fails closed before account lookup when the organization OTP channel is unhealthy', async () => {
    const { config, audit, outbox, mfa } = createMocks();
    const prisma = {
      organization: { findUnique: vi.fn().mockResolvedValue({ id: 'org-1', code: 'ACADEMY' }) },
      userLoginIdentifier: { findFirst: vi.fn() },
      user: { findFirst: vi.fn() },
      serializable: vi.fn(),
    };
    const service = new PhoneOtpService(
      prisma as never,
      config as never,
      mfa as never,
      audit as never,
      outbox as never,
      {
        assertAvailable: vi
          .fn()
          .mockRejectedValue(new ServiceUnavailableException('PHONE_OTP_UNAVAILABLE')),
      } as never,
    );

    await expect(
      service.requestOtp(
        { organizationCode: 'ACADEMY', password, phone: '+201234567890' },
        'corr-down',
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.userLoginIdentifier.findFirst).not.toHaveBeenCalled();
    expect(prisma.serializable).not.toHaveBeenCalled();
  });

  it('does not create a challenge or outbox message when the phone password is wrong', async () => {
    vi.mocked(verify).mockResolvedValue(false);
    const { config, audit, outbox, mfa } = createMocks();
    const org = { id: 'org-1', code: 'ACADEMY' };
    const ident = { id: 'ident-1', userId: 'user-1' };
    const user = {
      id: 'user-1',
      organizationId: 'org-1',
      passwordHash: 'password-hash',
      status: 'ACTIVE',
    };
    const prisma = {
      organization: { findUnique: vi.fn().mockResolvedValue(org) },
      userLoginIdentifier: { findFirst: vi.fn().mockResolvedValue(ident) },
      user: { findFirst: vi.fn().mockResolvedValue(user) },
      serializable: vi.fn(),
    };
    const service = new PhoneOtpService(
      prisma as never,
      config as never,
      mfa as never,
      audit as never,
      outbox as never,
      { assertAvailable: vi.fn().mockResolvedValue(undefined) } as never,
    );

    await expect(
      service.requestOtp(
        { organizationCode: 'ACADEMY', password: 'wrong-password', phone: '+201234567890' },
        'corr-wrong-password',
      ),
    ).rejects.toMatchObject({ status: 401 });

    expect(prisma.serializable).not.toHaveBeenCalled();
    expect(audit.write).not.toHaveBeenCalled();
    expect(outbox.add).not.toHaveBeenCalled();
  });

  it('requestOtp creates challenge, audit, and outbox with encrypted code (no plaintext)', async () => {
    vi.mocked(verify).mockResolvedValue(true);
    const { config, audit, outbox, mfa } = createMocks();
    const org = { id: 'org-1', code: 'ACADEMY' };
    const ident = { id: 'ident-1', userId: 'user-1' };
    const user = {
      id: 'user-1',
      organizationId: 'org-1',
      passwordHash: 'password-hash',
      status: 'ACTIVE',
    };

    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      userLoginIdentifier: { findFirst: vi.fn().mockResolvedValue(ident) },
      user: { findFirst: vi.fn().mockResolvedValue(user) },
      phoneOtpChallenge: {
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({ id: 'challenge-1' }),
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
      { assertAvailable: vi.fn().mockResolvedValue(undefined) } as never,
    );

    await service.requestOtp(
      { organizationCode: 'ACADEMY', password, phone: '+201234567890' },
      'corr-2',
    );

    expect(tx.phoneOtpChallenge.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        userId: 'user-1',
        normalizedPhone: '+201234567890',
        consumedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: expect.any(Date) as unknown },
    });

    expect(audit.write).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: 'user.phone_otp.request' }),
    );
    expect(outbox.add).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ type: 'security.phone_otp_requested' }),
    );

    const calls = outbox.add.mock.calls as Array<[unknown, { payload: { codeCipher: string } }]>;
    const outboxPayload = calls[0]?.[1]?.payload;
    expect(outboxPayload).toBeDefined();
    const decrypted = decryptActionToken(outboxPayload!.codeCipher, actionKey);
    expect(decrypted).toMatch(/^\d{6}$/);
  });

  it('does not create or send another code inside the server cooldown', async () => {
    vi.mocked(verify).mockResolvedValue(true);
    const { config, audit, outbox, mfa } = createMocks();
    const org = { id: 'org-1', code: 'ACADEMY' };
    const ident = { id: 'ident-1', userId: 'user-1' };
    const user = {
      id: 'user-1',
      organizationId: 'org-1',
      passwordHash: 'password-hash',
      status: 'ACTIVE',
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      userLoginIdentifier: { findFirst: vi.fn().mockResolvedValue(ident) },
      user: { findFirst: vi.fn().mockResolvedValue(user) },
      phoneOtpChallenge: {
        findFirst: vi.fn().mockResolvedValue({ id: 'active-challenge' }),
        updateMany: vi.fn(),
        create: vi.fn(),
      },
    };
    const prisma = {
      organization: { findUnique: vi.fn().mockResolvedValue(org) },
      userLoginIdentifier: { findFirst: vi.fn().mockResolvedValue(ident) },
      user: { findFirst: vi.fn().mockResolvedValue(user) },
      serializable: vi.fn((work: (client: typeof tx) => unknown) => work(tx)),
    };
    const service = new PhoneOtpService(
      prisma as never,
      config as never,
      mfa as never,
      audit as never,
      outbox as never,
      { assertAvailable: vi.fn().mockResolvedValue(undefined) } as never,
    );

    await service.requestOtp(
      { organizationCode: 'ACADEMY', password, phone: '+201234567890' },
      'corr-3',
    );

    expect(tx.phoneOtpChallenge.updateMany).not.toHaveBeenCalled();
    expect(tx.phoneOtpChallenge.create).not.toHaveBeenCalled();
    expect(audit.write).not.toHaveBeenCalled();
    expect(outbox.add).not.toHaveBeenCalled();
  });
});
