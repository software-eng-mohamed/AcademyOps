import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const databaseDescribe = process.env.DATABASE_URL ? describe : describe.skip;

databaseDescribe('learning lifecycle Phase 5 PostgreSQL-backed HTTP evidence', () => {
  it('proves 28 remaining enrollment, attendance, certificate and file operations', () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'plg-http-files-'));
    try {
      const result = spawnSync(
        process.execPath,
        [
          '-r',
          'ts-node/register/transpile-only',
          'test/http/release-critical-http.child.ts',
          'learning',
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
          timeout: 120_000,
          env: { ...process.env, PRIVATE_FILE_STORAGE_ROOT: storageRoot },
        },
      );
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('"learningPhase5Operations":28');
    } finally {
      const resolved = resolve(storageRoot);
      expect(resolved.startsWith(resolve(tmpdir()))).toBe(true);
      rmSync(resolved, { recursive: true, force: true });
    }
  }, 130_000);
});
