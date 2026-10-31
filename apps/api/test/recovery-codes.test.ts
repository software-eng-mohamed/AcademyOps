import { describe, expect, it } from 'vitest';
import {
  generateRecoveryCode,
  normalizeRecoveryCode,
  recoveryCodeDigest,
} from '../src/iam/auth/recovery-codes';

describe('MFA recovery codes', () => {
  it('generates 80-bit human-readable codes', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateRecoveryCode()));
    expect(codes.size).toBe(20);
    for (const code of codes) expect(code).toMatch(/^[A-F0-9]{4}(?:-[A-F0-9]{4}){4}$/);
  });

  it('normalizes display formatting before hashing with a pepper', () => {
    expect(normalizeRecoveryCode('abcd-1234-abcd-1234-abcd')).toBe('ABCD1234ABCD1234ABCD');
    expect(recoveryCodeDigest('ABCD-1234-ABCD-1234-ABCD', 'a-secure-test-pepper-value')).toBe(
      recoveryCodeDigest('abcd1234abcd1234abcd', 'a-secure-test-pepper-value'),
    );
    expect(recoveryCodeDigest('ABCD1234ABCD1234ABCD', 'pepper-one')).not.toBe(
      recoveryCodeDigest('ABCD1234ABCD1234ABCD', 'pepper-two'),
    );
  });
});
