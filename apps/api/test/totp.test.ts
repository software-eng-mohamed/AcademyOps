import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { MfaTotpConsumerService } from '../src/iam/auth/mfa-totp-consumer.service';
import {
  decryptSecret,
  encryptSecret,
  generateTotpCode,
  generateTotpSecret,
  verifyTotp,
  matchingTotpCounter,
} from '../src/iam/auth/totp';

describe('TOTP security primitives', () => {
  it('verifies only the current time-window code', () => {
    const secret = generateTotpSecret();
    const now = 1_800_000_000_000;
    expect(verifyTotp(secret, generateTotpCode(secret, now), now)).toBe(true);
    expect(verifyTotp(secret, '000000', now)).toBe(false);
  });

  it('returns the accepted counter so callers can reject replayed codes atomically', () => {
    const secret = generateTotpSecret();
    const now = 1_800_000_000_000;
    const code = generateTotpCode(secret, now);
    expect(matchingTotpCounter(secret, code, now)).toBe(Math.floor(now / 30_000));
    expect(matchingTotpCounter(secret, '000000', now)).toBeNull();
  });

  it('accepts a time-step once and rejects an atomic replay', async () => {
    const key = ['mfa', 'encryption', 'test', 'material', '32', 'bytes'].join('-');
    const secret = generateTotpSecret();
    const code = generateTotpCode(secret);
    const updateMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const consumer = new MfaTotpConsumerService(new ConfigService({ MFA_ENCRYPTION_KEY: key }));
    const factor = {
      id: 'factor-id',
      organizationId: 'org-id',
      userId: 'user-id',
      secretCipher: encryptSecret(secret, key),
      lastUsedCounter: null,
    };

    await expect(
      consumer.consume({ mfaFactor: { updateMany } } as never, [factor], code),
    ).resolves.toBe(true);
    await expect(
      consumer.consume({ mfaFactor: { updateMany } } as never, [factor], code),
    ).resolves.toBe(false);
    const lastCall = updateMany.mock.calls.at(-1)?.[0] as unknown as {
      where: { OR?: unknown[] };
    };
    expect(lastCall.where.OR).toHaveLength(2);
  });

  it('encrypts factor secrets at rest', () => {
    const encrypted = encryptSecret(
      'JBSWY3DPEHPK3PXP',
      'a-secure-key-material-that-is-long-enough',
    );
    expect(encrypted).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(encrypted, 'a-secure-key-material-that-is-long-enough')).toBe(
      'JBSWY3DPEHPK3PXP',
    );
    const parts = encrypted.split('.');
    parts[1] = Buffer.from(parts[1]!, 'base64url').subarray(0, 12).toString('base64url');
    expect(() =>
      decryptSecret(parts.join('.'), 'a-secure-key-material-that-is-long-enough'),
    ).toThrow();
  });
});
