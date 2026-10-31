import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const databaseDescribe = process.env.DATABASE_URL ? describe : describe.skip;

databaseDescribe('baseline identity and health PostgreSQL-backed HTTP evidence', () => {
  it('proves nine successful baseline operations through the full AppModule', () => {
    const result = spawnSync(
      process.execPath,
      [
        '-r',
        'ts-node/register/transpile-only',
        'test/http/release-critical-http.child.ts',
        'identity',
      ],
      { cwd: process.cwd(), encoding: 'utf8', timeout: 120_000 },
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"identityOperations":9');
  }, 130_000);
});
