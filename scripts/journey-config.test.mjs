import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  assertSyntheticOrganization,
  fixtureCredentials,
  journeyConfig,
  JourneySafetyError,
  readFixtureCredentials,
  syntheticTenant,
} from './journey-config.mjs';
import { authenticateFixture, currentTotp } from './journey-helpers.mjs';

// RFC 6238's public SHA-1 test vector, not an account credential.
const rfcBase32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const environment = () => ({
  NODE_ENV: 'test',
  E2E_FIXTURE_CONFIRM: 'synthetic-only',
  E2E_BASE_URL: 'http://127.0.0.1:3130',
  DATABASE_URL: 'postgresql://test-user@localhost:55432/plg_e2e?schema=public',
});
const organization = () => ({
  id: 'synthetic-id',
  code: syntheticTenant.code,
  name: syntheticTenant.name,
});
const artifact = () => ({
  marker: syntheticTenant.marker,
  version: 1,
  organizationCode: syntheticTenant.code,
  accounts: {
    owner: {
      email: 'owner+synthetic@e2e.invalid',
      password: randomBytes(24).toString('hex'),
      totpSecret: rfcBase32,
    },
    student: { email: 'student+synthetic@e2e.invalid', password: randomBytes(24).toString('hex') },
  },
});

test('configuration accepts explicit loopback test services and configurable artifact paths', () => {
  const result = journeyConfig({
    ...environment(),
    JOURNEY_OUTPUT_DIR: 'test-results/custom-journey',
  });
  assert.equal(result.baseUrl, 'http://127.0.0.1:3130');
  assert.match(result.outputDirectory, /test-results[/\\]custom-journey$/);
  assert.equal(result.artifactDirectory, null);
  assert.equal(
    journeyConfig({ ...environment(), E2E_BASE_URL: 'http://[::1]:3130' }).baseUrl,
    'http://[::1]:3130',
  );
});

test('recording requires both test mode and explicit synthetic consent', () => {
  for (const overrides of [
    { NODE_ENV: 'production' },
    { NODE_ENV: undefined },
    { E2E_FIXTURE_CONFIRM: undefined },
  ]) {
    assert.throws(() => journeyConfig({ ...environment(), ...overrides }), JourneySafetyError);
  }
});

test('URLs have no fallback and cannot target remote services', () => {
  for (const overrides of [
    { E2E_BASE_URL: undefined },
    { DATABASE_URL: undefined },
    { E2E_BASE_URL: 'https://academy.example.com' },
    { DATABASE_URL: 'postgresql://test-user@db.example.com/plg_e2e' },
    { E2E_BASE_URL: 'file:///tmp/site.html' },
  ])
    assert.throws(() => journeyConfig({ ...environment(), ...overrides }), JourneySafetyError);
});

test('web origins reject credentials, paths, query strings, and fragments', () => {
  for (const suffix of ['/dashboard', '/?key=example', '/#example']) {
    assert.throws(() =>
      journeyConfig({ ...environment(), E2E_BASE_URL: `http://localhost:3130${suffix}` }),
    );
  }
  assert.throws(() =>
    journeyConfig({ ...environment(), E2E_BASE_URL: 'http://user:example@localhost:3130' }),
  );
});

test('database safety rejects production names and alternate-host query parameters', () => {
  for (const url of [
    'postgresql://test-user@localhost/plg_academy',
    'postgresql://test-user@localhost/plg_e2e?host=remote.example.com',
    'postgresql://test-user@localhost/plg_e2e?service=production',
  ])
    assert.throws(() => journeyConfig({ ...environment(), DATABASE_URL: url }), JourneySafetyError);
  assert.throws(() => journeyConfig({ ...environment(), E2E_ORGANIZATION_CODE: 'PLG' }));
});

test('credentials require the generated fixture marker and reserved synthetic account identities', () => {
  assert.equal(fixtureCredentials(artifact()).owner.email, 'owner+synthetic@e2e.invalid');
  for (const field of ['version', 'marker', 'organizationCode']) {
    const value = artifact();
    value[field] = 'incorrect';
    assert.throws(() => fixtureCredentials(value), JourneySafetyError);
  }
  for (const update of [
    { email: 'owner@example.com' },
    { password: '' },
    { totpSecret: undefined },
  ]) {
    const value = artifact();
    Object.assign(value.accounts.owner, update);
    assert.throws(() => fixtureCredentials(value), JourneySafetyError);
  }
});

test('database and HTTP tenant identities must match exactly', () => {
  assert.doesNotThrow(() => assertSyntheticOrganization(organization(), 'synthetic-id'));
  assert.throws(() => assertSyntheticOrganization({ ...organization(), code: 'PLG' }));
  assert.throws(() => assertSyntheticOrganization({ ...organization(), name: 'Real Academy' }));
  assert.throws(() => assertSyntheticOrganization(organization(), 'different-database-id'));
});

test('missing or malformed credential files fail without including their contents', () => {
  const directory = mkdtempSync(join(tmpdir(), 'plg-journey-test-'));
  const path = join(directory, 'credentials.json');
  try {
    assert.throws(() => readFixtureCredentials(path), JourneySafetyError);
    writeFileSync(path, 'sensitive malformed input');
    assert.throws(
      () => readFixtureCredentials(path),
      (error) => !error.message.includes('sensitive'),
    );
  } finally {
    assert.equal(dirname(directory), resolve(tmpdir()));
    assert.match(basename(directory), /^plg-journey-test-/);
    rmSync(directory, { recursive: true });
  }
});

test('local TOTP generation matches public RFC 6238 SHA-1 vectors', () => {
  assert.equal(currentTotp(rfcBase32, 59_000), '287082');
  assert.equal(currentTotp(rfcBase32, 1_111_111_109_000), '081804');
  assert.throws(() => currentTotp(undefined), JourneySafetyError);
  assert.throws(() => currentTotp('not-base32'), JourneySafetyError);
});

test('authentication disables redirects and validates the local database tenant', async () => {
  const requests = [];
  const page = {
    request: {
      post: async (url, options) => {
        requests.push({ url, options });
        return { status: () => 201 };
      },
      get: async () => ({
        status: () => 200,
        json: async () => ({ organization: organization() }),
      }),
    },
  };
  await authenticateFixture(
    page,
    artifact().accounts.owner,
    journeyConfig(environment()),
    'synthetic-id',
  );
  assert.equal(requests[0].options.maxRedirects, 0);
  assert.equal(requests[0].options.data.organizationCode, 'E2EACADEMY');
  await assert.rejects(() =>
    authenticateFixture(page, artifact().accounts.owner, journeyConfig(environment()), 'wrong-id'),
  );
});

test('authentication does not follow a login redirect or read a tenant after rejection', async () => {
  let identityRead = false;
  const page = {
    request: {
      post: async () => ({ status: () => 302 }),
      get: async () => {
        identityRead = true;
      },
    },
  };
  await assert.rejects(() =>
    authenticateFixture(
      page,
      artifact().accounts.student,
      journeyConfig(environment()),
      'synthetic-id',
    ),
  );
  assert.equal(identityRead, false);
});

test('CLI refuses unsafe mode before loading a browser or database client', () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('./run-complete-e2e-journey.mjs', import.meta.url))],
    {
      env: { ...process.env, NODE_ENV: 'production', DATABASE_URL: 'do-not-log-this-value' },
      encoding: 'utf8',
      timeout: 10_000,
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Set NODE_ENV=test/);
  assert.doesNotMatch(result.stderr, /do-not-log-this-value/);
});
