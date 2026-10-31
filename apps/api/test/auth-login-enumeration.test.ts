import { verify } from 'argon2';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthLoginService } from '../src/iam/auth/auth-login.service';
import type { MfaService } from '../src/iam/auth/mfa.service';
import type { PrismaService } from '../src/platform/database/prisma.service';
import type { ConfigService } from '@nestjs/config';

vi.mock('argon2', () => ({ verify: vi.fn() }));

const loginInput = {
  organizationCode: 'PLG',
  identifierType: 'EMAIL' as const,
  identifier: 'missing@example.com',
  password: 'submitted-password',
};

describe('AuthLoginService enumeration resistance', () => {
  beforeEach(() => vi.clearAllMocks());

  it('performs an Argon2 verification when the organization is unknown', async () => {
    vi.mocked(verify).mockResolvedValue(false);
    const prisma = {
      organization: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const service = new AuthLoginService(prisma, {} as ConfigService, {} as MfaService);

    await expect(service.login(loginInput)).rejects.toMatchObject({ status: 401 });
    expect(verify).toHaveBeenCalledOnce();
    expect(verify).toHaveBeenCalledWith(expect.stringContaining('$argon2id$'), loginInput.password);
  });

  it('performs an Argon2 verification when the identifier is unknown', async () => {
    vi.mocked(verify).mockResolvedValue(false);
    const prisma = {
      organization: { findUnique: vi.fn().mockResolvedValue({ id: 'org-1' }) },
      userLoginIdentifier: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const service = new AuthLoginService(prisma, {} as ConfigService, {} as MfaService);

    await expect(service.login(loginInput)).rejects.toMatchObject({ status: 401 });
    expect(verify).toHaveBeenCalledOnce();
    expect(verify).toHaveBeenCalledWith(expect.stringContaining('$argon2id$'), loginInput.password);
  });
});
