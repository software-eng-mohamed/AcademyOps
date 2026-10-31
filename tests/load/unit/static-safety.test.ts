import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  loadConfiguration as loadK6Configuration,
  repositoryFile,
  sustainedOwnerReads,
} from '../k6/safety.mjs';

const k6 = readFileSync(resolve(process.cwd(), 'tests/load/k6/http-workload.mjs'), 'utf8');
const safety = readFileSync(resolve(process.cwd(), 'tests/load/k6/safety.mjs'), 'utf8');
const realtime = readFileSync(resolve(process.cwd(), 'tests/load/realtime/run.ts'), 'utf8');

void test('k6 keeps remote, fixture, previous-gate and authorization circuit breakers', () => {
  for (const marker of [
    'E2E_LOAD_REMOTE',
    'E2E_LOAD_ALLOWED_ORIGIN',
    'plg-synthetic-e2e-v1',
    'assertPreviousGate',
    'security_failures',
  ]) {
    assert.equal(`${safety}\n${k6}`.includes(marker), true, marker);
  }
  assert.equal(k6.includes('http.post('), false);
  assert.match(k6, /systemTags:/);
  assert.match(k6, /name: sanitizedRouteName\(path\)/);
  assert.match(k6, /open\(repositoryFile\(sessionPath\)\)/);
  assert.match(k6, /open\(repositoryFile\(__ENV\.E2E_LOAD_PREVIOUS_GATE\)\)/);
  for (const route of [
    '/attendance-summary',
    '/installments?limit=10',
    '/finance-summary',
    '/payments?enrollmentId=',
    '/calendar?from=',
    '/attendance?limit=50',
  ]) {
    assert.equal(k6.includes(route), true, route);
  }
});

void test('k6 resolves documented relative artifacts from the repository root', () => {
  assert.equal(
    repositoryFile('test-results/load/sessions-r0.json'),
    '../../../test-results/load/sessions-r0.json',
  );
  assert.equal(
    repositoryFile('D:\\work\\PLG-SS\\test-results\\load\\sessions-r0.json'),
    'D:/work/PLG-SS/test-results/load/sessions-r0.json',
  );
  assert.equal(repositoryFile('/tmp/gate-10.json'), '/tmp/gate-10.json');
});

void test('sustained owner reads exclude permissions that require fresh MFA step-up', () => {
  assert.equal(k6.includes('/api/v1/users'), false);
  assert.deepEqual(
    sustainedOwnerReads.map(({ path }) => path),
    ['/api/v1/dashboard/overview', '/api/v1/students?limit=25', '/api/v1/programs?limit=25'],
  );
  const permissionSource = readFileSync(
    resolve(process.cwd(), 'packages/contracts/src/permissions.ts'),
    'utf8',
  );
  const stepUpBlock = /requiresStepUpMfa[\s\S]*?new Set<PermissionCode>\(\[([\s\S]*?)\]\)/.exec(
    permissionSource,
  )?.[1];
  assert.ok(stepUpBlock);
  const stepUpPermissions = new Set(
    [...stepUpBlock.matchAll(/'([^']+)'/g)].map((matched) => matched[1]),
  );
  for (const { permission } of sustainedOwnerReads) {
    assert.equal(stepUpPermissions.has(permission), false, permission);
  }
  const catalogController = readFileSync(
    resolve(process.cwd(), 'apps/api/src/academic/catalog.controller.ts'),
    'utf8',
  );
  assert.match(
    catalogController,
    /class ProgramsController[\s\S]*?@RequirePermission\('academic\.catalog\.read'\)[\s\S]*?@Get\(\)/,
  );
});

void test('k6 origin safety does not depend on the browser URL global', () => {
  const urlDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'URL');
  assert.ok(urlDescriptor);
  Object.defineProperty(globalThis, 'URL', { configurable: true, value: undefined });
  try {
    assert.equal(
      loadK6Configuration({ E2E_LOAD_BASE_URL: 'http://localhost:3100/' }).target.origin,
      'http://localhost:3100',
    );
    assert.throws(
      () =>
        loadK6Configuration({
          E2E_LOAD_BASE_URL: 'https://stage.example.test',
          E2E_LOAD_REMOTE: 'synthetic-only',
          E2E_LOAD_ALLOWED_ORIGIN: 'https://stage.example.test/path',
        }),
      /HTTP\(S\) origin|exact allowed origin/,
    );
    assert.equal(
      loadK6Configuration({
        E2E_LOAD_BASE_URL: 'https://stage.example.test',
        E2E_LOAD_REMOTE: 'synthetic-only',
        E2E_LOAD_ALLOWED_ORIGIN: 'https://stage.example.test',
        E2E_LOAD_REVISION: '5738261',
      }).target.origin,
      'https://stage.example.test',
    );
  } finally {
    Object.defineProperty(globalThis, 'URL', urlDescriptor);
  }
  assert.doesNotMatch(safety, /\bnew\s+URL\s*\(/);
});

void test('realtime is websocket-only, ticket-authenticated, and never logs tokens', () => {
  assert.match(realtime, /transports: \['websocket'\]/);
  assert.match(realtime, /\/api\/v1\/realtime\/ticket/);
  assert.doesNotMatch(realtime, /console\.log\(.*ticket/);
});
