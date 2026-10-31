import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, expect } from 'vitest';
import { getTrackedFiles } from '../src/git-utils';

it('includes new source files but excludes ignored build output', () => {
  const directory = mkdtempSync(join(tmpdir(), 'plg-line-gate-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: directory });
    writeFileSync(join(directory, '.gitignore'), 'ignored.ts\n');
    writeFileSync(join(directory, 'tracked.ts'), 'export {};\n');
    execFileSync('git', ['add', 'tracked.ts', '.gitignore'], { cwd: directory });
    writeFileSync(join(directory, 'new.ts'), '// new source\n'.repeat(301));
    writeFileSync(join(directory, 'ignored.ts'), '// generated\n'.repeat(301));
    expect(getTrackedFiles(directory).sort()).toEqual(['.gitignore', 'new.ts', 'tracked.ts']);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
