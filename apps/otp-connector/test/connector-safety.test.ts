import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readConnectorConfig } from '../src/connector-config';
import { parseSendRequest, safeBearer } from '../src/connector-http';
import { SentLedger } from '../src/sent-ledger';

const token = 'a'.repeat(64);
const repositoryRoot = join(import.meta.dirname, '..', '..', '..');

describe('OTP connector safety boundaries', () => {
  it('excludes reusable browser authentication state from Git and Docker contexts', () => {
    const expected = [
      'apps/otp-connector/.otp-connector-session/',
      'apps/otp-connector/.wwebjs_cache/',
    ];
    const gitIgnore = readFileSync(join(repositoryRoot, '.gitignore'), 'utf8');
    const dockerIgnore = readFileSync(join(repositoryRoot, '.dockerignore'), 'utf8');

    for (const path of expected) {
      expect(gitIgnore.split(/\r?\n/u)).toContain(path);
      expect(dockerIgnore.split(/\r?\n/u)).toContain(path);
    }
  });

  it('removes stale base tooling and runs the patched browser image as non-root', () => {
    const dockerfile = readFileSync(
      join(repositoryRoot, 'deploy', 'Dockerfile.otp-connector'),
      'utf8',
    );
    expect(dockerfile).toContain('apt-get upgrade -y --no-install-recommends');
    expect(dockerfile).toContain('/home/pptruser/node_modules');
    expect(dockerfile).toContain('/usr/local/lib/node_modules/npm');
    expect(dockerfile).toContain('ln -s "$chrome_path" /usr/bin/google-chrome-stable');
    expect(dockerfile.trimEnd()).toContain('USER pptruser');
  });

  it('requires a strong internal token and exact internal API origins', () => {
    expect(() =>
      readConnectorConfig({
        NODE_ENV: 'production',
        OTP_CONNECTOR_INTERNAL_TOKEN: token,
        OTP_CONNECTOR_API_URLS: 'http://api-a:3001,http://api-b:3001',
        OTP_CONNECTOR_CHROME_PATH: process.execPath,
      }),
    ).not.toThrow();
    expect(() =>
      readConnectorConfig({
        NODE_ENV: 'production',
        OTP_CONNECTOR_INTERNAL_TOKEN: 'short',
        OTP_CONNECTOR_API_URLS: 'http://api-a:3001',
        OTP_CONNECTOR_CHROME_PATH: process.execPath,
      }),
    ).toThrow('OTP_CONNECTOR_TOKEN_INVALID');
    expect(() =>
      readConnectorConfig({
        NODE_ENV: 'production',
        OTP_CONNECTOR_INTERNAL_TOKEN: token,
        OTP_CONNECTOR_API_URLS: 'https://attacker.example.com',
        OTP_CONNECTOR_CHROME_PATH: process.execPath,
      }),
    ).toThrow('OTP_CONNECTOR_API_URL_INVALID');
  });

  it('validates bearer tokens in constant-time-compatible form', () => {
    expect(safeBearer(`Bearer ${token}`, token)).toBe(true);
    expect(safeBearer(`Bearer ${'b'.repeat(64)}`, token)).toBe(false);
    expect(safeBearer(undefined, token)).toBe(false);
  });

  it('accepts only bounded E.164 OTP messages without extra fields', () => {
    const request = {
      organizationId: '11111111-1111-4111-8111-111111111111',
      to: '+201001234567',
      body: 'Your code is 123456',
      idempotencyKey: '22222222-2222-4222-8222-222222222222',
    };
    expect(parseSendRequest(JSON.stringify(request))).toEqual(request);
    expect(() => parseSendRequest(JSON.stringify({ ...request, to: '01001234567' }))).toThrow(
      'BODY_INVALID',
    );
    expect(() => parseSendRequest(JSON.stringify({ ...request, body: 'x'.repeat(321) }))).toThrow(
      'BODY_INVALID',
    );
  });

  it('persists only hashed delivery idempotency markers across restarts', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'plg-otp-ledger-'));
    try {
      const ledger = new SentLedger(directory);
      expect(await ledger.has('org-a', 'event-a')).toBe(false);
      await ledger.record('org-a', 'event-a');
      expect(await new SentLedger(directory).has('org-a', 'event-a')).toBe(true);
      expect(await ledger.has('org-a', 'event-b')).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
