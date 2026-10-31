import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const databaseDescribe = process.env.DATABASE_URL ? describe : describe.skip;

databaseDescribe('platform Phase 5 PostgreSQL-backed HTTP evidence', () => {
  it('proves 8 remaining import, messaging and realtime operations', () => {
    const result = spawnSync(
      process.execPath,
      [
        '-r',
        'ts-node/register/transpile-only',
        'test/http/release-critical-http.child.ts',
        'platform',
      ],
      { cwd: process.cwd(), encoding: 'utf8', timeout: 120_000 },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('"platformPhase5Operations":8');
    expect(result.stderr).toBe('');
  }, 130_000);
});
