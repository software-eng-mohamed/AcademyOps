import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import type { LoadGate, LoadSummary } from '../gates.js';

function withSummaries(run: (directory: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), 'plg-aggregate-command-'));
  assert.equal(dirname(directory), resolve(tmpdir()));
  try {
    for (const suite of ['http', 'realtime'] as const) {
      const summary: LoadSummary = {
        marker: 'plg-synthetic-load-summary-v1',
        fixtureMarker: 'plg-synthetic-e2e-v1',
        revision: 'abcdef1234567',
        generatedAt: new Date().toISOString(),
        suite,
        profile: '10',
        globalUsers: 10,
        localUsers: 10,
        targetOrigin: 'http://127.0.0.1:3100',
        runner: { index: 0, count: 1 },
        passed: true,
        metrics: {},
      };
      writeFileSync(join(directory, `${suite}.json`), JSON.stringify(summary));
    }
    run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function runAggregator(directory: string, paths: string[]) {
  const result = spawnSync(
    process.execPath,
    [resolve(process.cwd(), 'test-results/load/dist/tools/aggregate-gate.js'), ...paths],
    { cwd: directory, encoding: 'utf8' },
  );
  const gate = JSON.parse(
    readFileSync(join(directory, 'test-results/load/gates/gate-10.json'), 'utf8'),
  ) as LoadGate;
  return { result, gate };
}

for (const separator of [[], ['--']]) {
  void test(`aggregate command accepts ${separator.length ? 'the pnpm' : 'no'} argument separator`, () => {
    withSummaries((directory) => {
      const { result, gate } = runAggregator(directory, [
        ...separator,
        'http.json',
        'realtime.json',
      ]);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(gate.passed, true);
      assert.equal(gate.revision, 'abcdef1234567');
      assert.equal(gate.suites.http.runners, 1);
      assert.equal(gate.suites.realtime.runners, 1);
    });
  });
}

void test('aggregate command still rejects an incomplete gate after the pnpm separator', () => {
  withSummaries((directory) => {
    const { result, gate } = runAggregator(directory, ['--', 'http.json']);
    assert.equal(result.status, 1);
    assert.equal(gate.passed, false);
    assert.equal(gate.suites.realtime.runners, 0);
  });
});
