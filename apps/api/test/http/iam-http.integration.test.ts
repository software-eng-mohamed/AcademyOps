import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const databaseDescribe = process.env.DATABASE_URL ? describe : describe.skip;

databaseDescribe('IAM Phase 5 PostgreSQL-backed HTTP evidence', () => {
  it('proves 24 remaining IAM operations including successful phone OTP', () => {
    const result = spawnSync(
      process.execPath,
      ['-r', 'ts-node/register/transpile-only', 'test/http/release-critical-http.child.ts', 'iam'],
      { cwd: process.cwd(), encoding: 'utf8', timeout: 120_000 },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"iamPhase5Operations":24');
    expect(result.stderr).toBe('');
  }, 130_000);
});
