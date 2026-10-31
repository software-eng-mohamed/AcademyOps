import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { developmentOnlyModules } from '../src/app.module';
import { DevOnlyTotpService } from '../src/dev-only/dev-only-totp.service';
import { encryptSecret, generateTotpCode } from '../src/iam/auth/totp';

const key = 'development-mfa-key-at-least-thirty-two-characters';
const secret = 'JBSWY3DPEHPK3PXP';

function service(nodeEnvironment: string) {
  const prisma = {
    organization: { findUnique: vi.fn().mockResolvedValue({ id: 'organization-id' }) },
    userLoginIdentifier: { findFirst: vi.fn().mockResolvedValue({ userId: 'user-id' }) },
    mfaFactor: {
      findFirst: vi.fn().mockResolvedValue({ secretCipher: encryptSecret(secret, key) }),
      create: vi.fn().mockResolvedValue({}),
    },
  };
  return {
    prisma,
    service: new DevOnlyTotpService(
      prisma as never,
      new ConfigService({ NODE_ENV: nodeEnvironment, MFA_ENCRYPTION_KEY: key }),
    ),
  };
}

describe('development-only TOTP endpoint', () => {
  it('registers its module only in development', () => {
    expect(developmentOnlyModules('development')).toHaveLength(1);
    expect(developmentOnlyModules('test')).toEqual([]);
    expect(developmentOnlyModules('production')).toEqual([]);
    expect(developmentOnlyModules(undefined)).toEqual([]);
  });

  it('returns the current code without exposing the TOTP secret', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-30T00:00:10.000Z'));
    const { service: totp } = service('development');
    const response = await totp.currentCode('plg', 'OWNER@ACADEMYOPS.LOCAL');
    expect(response).toMatchObject({
      code: generateTotpCode(secret, Date.now()),
      email: 'owner@academyops.local',
      validForSeconds: 20,
    });
    expect(response).not.toHaveProperty('secret');
    vi.useRealTimers();
  });

  it('auto-provisions a verified factor when none exists in development', async () => {
    const { prisma, service: totp } = service('development');
    prisma.mfaFactor.findFirst.mockResolvedValueOnce(null);
    const response = await totp.currentCode('plg', 'new-dev@academyops.local');
    expect(response.code).toMatch(/^\d{6}$/);
    expect(response.email).toBe('new-dev@academyops.local');
    expect(prisma.mfaFactor.create).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          organizationId: 'organization-id',
          userId: 'user-id',
          type: 'TOTP',
        }),
      }),
    );
  });

  it('behaves as not found outside development before querying the database', async () => {
    const { prisma, service: totp } = service('production');
    await expect(totp.currentCode('PLG', 'owner@academyops.local')).rejects.toMatchObject({
      status: 404,
    });
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });
});
