import { describe, expect, it } from 'vitest';
import { decryptActionToken, encryptActionToken } from '../src/iam/auth/action-token';

describe('encrypted action tokens', () => {
  it('round-trips without storing the raw reset token', () => {
    const secret = 'action-token-encryption-at-least-32-bytes';
    const token = 'reset-token-that-must-not-be-stored';
    const ciphertext = encryptActionToken(token, secret);
    expect(ciphertext).not.toContain(token);
    expect(decryptActionToken(ciphertext, secret)).toBe(token);
  });

  it('rejects ciphertext changed after issuance', () => {
    const secret = 'action-token-encryption-at-least-32-bytes';
    const ciphertext = encryptActionToken('token', secret);
    expect(() => decryptActionToken(`${ciphertext}x`, secret)).toThrow();
  });

  it('rejects a shortened GCM authentication tag', () => {
    const secret = 'action-token-encryption-at-least-32-bytes';
    const parts = encryptActionToken('token', secret).split('.');
    parts[1] = Buffer.from(parts[1]!, 'base64url').subarray(0, 12).toString('base64url');
    expect(() => decryptActionToken(parts.join('.'), secret)).toThrow();
  });
});
