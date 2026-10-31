import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertTargetAllowed,
  configuration,
  loadSessionArtifact,
  roleAllocations,
  type LoadRole,
} from '../config.js';

void test('remote targets require an exact origin and synthetic-only switch', () => {
  assert.throws(() => assertTargetAllowed('https://stage.example.test', {}), /synthetic-only/);
  assert.throws(
    () =>
      assertTargetAllowed('https://stage.example.test', {
        E2E_LOAD_REMOTE: 'synthetic-only',
        E2E_LOAD_ALLOWED_ORIGIN: 'https://stage.example.test/path',
      }),
    /exactly equal/,
  );
  assert.equal(
    assertTargetAllowed('https://stage.example.test', {
      E2E_LOAD_REMOTE: 'synthetic-only',
      E2E_LOAD_ALLOWED_ORIGIN: 'https://stage.example.test',
    }).origin,
    'https://stage.example.test',
  );
});

void test('large profiles require distributed runners unless risk is acknowledged', () => {
  assert.throws(
    () => configuration({ E2E_LOAD_PROFILE: '10000', E2E_LOAD_BASE_URL: 'http://localhost:3100' }),
    /at least 4 runners/,
  );
  assert.equal(
    configuration({
      E2E_LOAD_PROFILE: '10000',
      E2E_LOAD_BASE_URL: 'http://localhost:3100',
      E2E_LOAD_RUNNER_COUNT: '4',
      E2E_LOAD_RUNNER_INDEX: '3',
    }).localUsers,
    2_500,
  );
  assert.throws(
    () =>
      configuration({
        E2E_LOAD_PROFILE: '10',
        E2E_LOAD_BASE_URL: 'http://localhost:3100',
        E2E_LOAD_RUNNER_COUNT: '4',
      }),
    /at least four users/,
  );
});

void test('role allocation is exact at 100 users and covers every role in smoke', () => {
  assert.deepEqual(roleAllocations(100), { student: 94, attendance: 3, accounts: 2, owner: 1 });
  assert.deepEqual(roleAllocations(10), { student: 7, attendance: 1, accounts: 1, owner: 1 });
});

void test('session artifact requires unique synthetic subjects and no PII', () => {
  const directory = mkdtempSync(join(tmpdir(), 'plg-load-test-'));
  const config = configuration({ E2E_LOAD_BASE_URL: 'http://localhost:3100' });
  const allocation = roleAllocations(config.localUsers);
  const sessions = Object.entries(allocation).flatMap(([role, count]) =>
    Array.from({ length: count }, (_, index) => ({
      role: role as LoadRole,
      syntheticSubjectId: `load-${role}-${index + 1}`,
      ...(role === 'student'
        ? { enrollmentId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}` }
        : {}),
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      cookies: { plg_session: 's'.repeat(32), plg_csrf: 'c'.repeat(32) },
    })),
  );
  const artifact = {
    marker: 'plg-synthetic-load-sessions-v1',
    fixtureMarker: 'plg-synthetic-e2e-v1',
    revision: 'local-worktree',
    organization: { code: 'E2EACADEMY', name: '[SYNTHETIC E2E] AcademyOps' },
    targetOrigin: 'http://localhost:3100',
    runner: { index: 0, count: 1 },
    targets: { attendanceSessionId: '00000000-0000-4000-8000-000000000999' },
    sessions,
  };
  mkdirSync(directory, { recursive: true });
  const validPath = join(directory, 'valid.json');
  writeFileSync(validPath, JSON.stringify(artifact));
  assert.equal(loadSessionArtifact(validPath, config).sessions.length, 10);
  const invalidPath = join(directory, 'invalid.json');
  writeFileSync(invalidPath, JSON.stringify({ ...artifact, email: 'real@example.test' }));
  assert.throws(() => loadSessionArtifact(invalidPath, config), /credentials|PII/);
  rmSync(directory, { recursive: true, force: true });
});
