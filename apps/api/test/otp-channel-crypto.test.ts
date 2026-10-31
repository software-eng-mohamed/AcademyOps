import { describe, expect, it } from 'vitest';
import {
  decryptOtpChannelSecret,
  encryptOtpChannelSecret,
} from '../src/messaging/otp-channel-crypto';

const key = Buffer.alloc(32, 17).toString('base64');

describe('OTP channel secret encryption', () => {
  it('round-trips with AES-GCM and bound associated data', () => {
    const encrypted = encryptOtpChannelSecret('secret-session-value', key, 'org:one');
    expect(encrypted).not.toContain('secret-session-value');
    expect(decryptOtpChannelSecret(encrypted, key, 'org:one')).toBe('secret-session-value');
    expect(() => decryptOtpChannelSecret(encrypted, key, 'org:two')).toThrow();
  });

  it('rejects a modified ciphertext byte', () => {
    const encrypted = encryptOtpChannelSecret('secret-session-value', key, 'org:one');
    const parts = encrypted.split('.');
    const ciphertext = Buffer.from(parts[2]!, 'base64url');
    ciphertext[0] = ciphertext[0]! ^ 1;
    parts[2] = ciphertext.toString('base64url');
    expect(() => decryptOtpChannelSecret(parts.join('.'), key, 'org:one')).toThrow();
  });

  it('rejects malformed keys and envelopes', () => {
    expect(() => encryptOtpChannelSecret('value', 'bad-key', 'org:one')).toThrow();
    expect(() => decryptOtpChannelSecret('v1.bad.bad.bad', key, 'org:one')).toThrow();
  });
});
