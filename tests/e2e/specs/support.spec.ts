import { test, expect } from '@playwright/test';
import { assertTargetAllowed, credentialsFromArtifact } from '../support/environment';
import { redactEvidenceText } from '../support/evidence';
import { currentTotp } from '../support/totp';

test('TOTP helper matches the RFC 6238 SHA-1 vector', () => {
  expect(currentTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59_000)).toBe('287082');
});

test('remote target requires both acknowledgement and exact origin allowlist', () => {
  expect(() => assertTargetAllowed('https://stage.example.test', {})).toThrow();
  expect(() =>
    assertTargetAllowed('https://stage.example.test', {
      E2E_ALLOW_REMOTE: 'synthetic-only',
      E2E_TARGET_ALLOWLIST: 'https://other.example.test',
    }),
  ).toThrow();
  expect(
    assertTargetAllowed('https://stage.example.test/path', {
      E2E_ALLOW_REMOTE: 'synthetic-only',
      E2E_TARGET_ALLOWLIST: 'https://stage.example.test',
    }).origin,
  ).toBe('https://stage.example.test');
});

test('loopback targets include IPv4 and bracketed IPv6 without remote opt-in', () => {
  for (const origin of ['http://127.0.0.1:3150', 'http://localhost:3150', 'http://[::1]:3150']) {
    expect(assertTargetAllowed(origin, {}).origin).toBe(origin);
  }
});

test('evidence redaction removes direct identifiers and secrets', () => {
  const value = redactEvidenceText(
    'user=a.person+e2e@example.test phone=+20 100 123 4567 id=123e4567-e89b-42d3-a456-426614174000 token=abc123',
  );
  expect(value).not.toContain('a.person');
  expect(value).not.toContain('100 123');
  expect(value).not.toContain('123e4567');
  expect(value).not.toContain('abc123');
});

test('credentials require the synthetic marker and selected organization', () => {
  const accounts = {
    owner: { email: 'owner@e2e.invalid', password: 'long-random-password-value' },
  };
  expect(() =>
    credentialsFromArtifact({ marker: 'wrong', organizationCode: 'E2EACADEMY', accounts }, 'owner'),
  ).toThrow(/marker/);
  expect(() =>
    credentialsFromArtifact(
      { marker: 'plg-synthetic-e2e-v1', organizationCode: 'REAL', accounts },
      'owner',
    ),
  ).toThrow(/marker/);
});
