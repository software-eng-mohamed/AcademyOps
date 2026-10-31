import { describe, expect, it } from 'vitest';
import {
  decryptLegacyArchive,
  encryptLegacyArchive,
  legacyArchiveHash,
} from '../src/imports/import-archive-crypto';

const secret = 'legacy-archive-test-key-that-is-long-enough';

describe('legacy archive AES-256-GCM', () => {
  it('round-trips without plaintext and detects tampering', () => {
    const plaintext = JSON.stringify({ phone: '01000000000', message: 'private' });
    const encrypted = encryptLegacyArchive(plaintext, secret);
    expect(encrypted).not.toContain('01000000000');
    expect(decryptLegacyArchive(encrypted, secret)).toBe(plaintext);
    expect(legacyArchiveHash(plaintext)).toMatch(/^[a-f0-9]{64}$/);
    const parts = encrypted.split('.');
    const tag = Buffer.from(parts[3]!, 'base64url');
    tag[0] = tag[0]! ^ 0x01;
    parts[3] = tag.toString('base64url');
    expect(() => decryptLegacyArchive(parts.join('.'), secret)).toThrow();
  });

  it('rejects a shortened GCM authentication tag', () => {
    const parts = encryptLegacyArchive('private', secret).split('.');
    parts[2] = Buffer.from(parts[2]!, 'base64url').subarray(0, 12).toString('base64url');
    expect(() => decryptLegacyArchive(parts.join('.'), secret)).toThrow();
  });
});
