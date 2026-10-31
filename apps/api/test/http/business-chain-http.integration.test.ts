import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const databaseDescribe = process.env.DATABASE_URL ? describe : describe.skip;

databaseDescribe('enrollment, attendance and certificate PostgreSQL-backed HTTP chain', () => {
  it('proves guarded lifecycle, idempotency, auto-absence and certificate issuance', () => {
    const result = spawnSync(
      process.execPath,
      [
        '-r',
        'ts-node/register/transpile-only',
        'test/http/release-critical-http.child.ts',
        'business',
      ],
      { cwd: process.cwd(), encoding: 'utf8', timeout: 120_000 },
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"businessOperations":20');
  }, 130_000);
});
