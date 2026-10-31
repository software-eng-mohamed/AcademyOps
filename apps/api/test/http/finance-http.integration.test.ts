import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const databaseDescribe = process.env.DATABASE_URL ? describe : describe.skip;

databaseDescribe('finance, pricing, reporting and workspace PostgreSQL-backed HTTP chain', () => {
  it('proves 54 guarded operations and financial invariants through the full AppModule', () => {
    const result = spawnSync(
      process.execPath,
      [
        '-r',
        'ts-node/register/transpile-only',
        'test/http/release-critical-http.child.ts',
        'finance',
      ],
      { cwd: process.cwd(), encoding: 'utf8', timeout: 120_000 },
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"financeOperations":54');
  }, 130_000);
});
