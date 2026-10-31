import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

void test('load:http prepares repository-root result and gate directories before k6', () => {
  const directory = mkdtempSync(join(tmpdir(), 'plg-load-output-'));
  try {
    execFileSync(
      process.execPath,
      [resolve(process.cwd(), 'test-results/load/dist/tools/prepare-output.js')],
      { cwd: directory, stdio: 'pipe' },
    );
    assert.equal(existsSync(join(directory, 'test-results/load/results')), true);
    assert.equal(existsSync(join(directory, 'test-results/load/gates')), true);

    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as {
      scripts: Record<string, string>;
    };
    assert.match(packageJson.scripts['load:http'] ?? '', /^pnpm load:prepare && k6 run /);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
