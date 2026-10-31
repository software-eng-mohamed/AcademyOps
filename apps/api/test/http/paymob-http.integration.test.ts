import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const databaseDescribe = process.env.DATABASE_URL ? describe : describe.skip;

databaseDescribe('Paymob PostgreSQL-backed HTTP lifecycle', () => {
  it('creates and replays checkout, then accepts signed success exactly once', () => {
    const result = spawnSync(
      process.execPath,
      [
        '-r',
        'ts-node/register/transpile-only',
        'test/http/release-critical-http.child.ts',
        'paymob',
      ],
      { cwd: process.cwd(), encoding: 'utf8', timeout: 120_000 },
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"paymobOperations":2');
  }, 130_000);
});
