import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { configuration } from '../config.js';
import { aggregateGate, assertPreviousGate, type LoadSummary } from '../gates.js';

function summary(suite: 'http' | 'realtime', runner: number): LoadSummary {
  return {
    marker: 'plg-synthetic-load-summary-v1',
    fixtureMarker: 'plg-synthetic-e2e-v1',
    revision: 'abcdef1234567',
    generatedAt: new Date().toISOString(),
    suite,
    profile: '2500',
    globalUsers: 2_500,
    localUsers: 1_250,
    targetOrigin: 'https://synthetic.example.test',
    runner: { index: runner, count: 2 },
    passed: true,
    metrics: {},
  };
}

void test('gate passes only with every runner from both suites', () => {
  const gate = aggregateGate([
    summary('http', 0),
    summary('http', 1),
    summary('realtime', 0),
    summary('realtime', 1),
  ]);
  assert.equal(gate.passed, true);
  assert.equal(aggregateGate([summary('http', 0), summary('realtime', 0)]).passed, false);
});

void test('gate rejects summaries from different targets', () => {
  const other = summary('realtime', 0);
  other.targetOrigin = 'https://other.example.test';
  assert.throws(() => aggregateGate([summary('http', 0), other]), /different runs/);
});

void test('previous gate is bound to revision and freshness', () => {
  const directory = mkdtempSync(join(tmpdir(), 'plg-gate-test-'));
  const path = join(directory, 'gate.json');
  const config = configuration({
    E2E_LOAD_BASE_URL: 'http://localhost:3100',
    E2E_LOAD_PROFILE: '50',
    E2E_LOAD_REVISION: 'abcdef1234567',
  });
  const gate = {
    marker: 'plg-synthetic-load-gate-v1',
    fixtureMarker: 'plg-synthetic-e2e-v1',
    revision: config.revision,
    generatedAt: new Date().toISOString(),
    targetOrigin: config.target.origin,
    profile: '10',
    runnerCount: 1,
    passed: true,
    suites: { http: { runners: 1, passed: true }, realtime: { runners: 1, passed: true } },
  };
  writeFileSync(path, JSON.stringify(gate));
  assert.doesNotThrow(() => assertPreviousGate({ E2E_LOAD_PREVIOUS_GATE: path }, config));
  writeFileSync(path, JSON.stringify({ ...gate, revision: 'deadbee' }));
  assert.throws(
    () => assertPreviousGate({ E2E_LOAD_PREVIOUS_GATE: path }, config),
    /another target/,
  );
  writeFileSync(
    path,
    JSON.stringify({
      ...gate,
      generatedAt: new Date(Date.now() - 7 * 60 * 60 * 1_000).toISOString(),
    }),
  );
  assert.throws(
    () => assertPreviousGate({ E2E_LOAD_PREVIOUS_GATE: path }, config),
    /another target/,
  );
  rmSync(directory, { recursive: true, force: true });
});
