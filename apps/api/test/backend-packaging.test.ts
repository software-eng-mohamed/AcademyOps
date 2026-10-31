import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const shell = [
  process.env.PLG_TEST_POSIX_SHELL,
  'sh',
  ...(process.platform === 'win32' ? ['C:\\Program Files\\Git\\bin\\sh.exe'] : []),
].find((candidate) => candidate && spawnSync(candidate, ['-c', 'exit 0']).status === 0);

function withPackagingFixture(run: (fixture: string) => void): void {
  const fixture = mkdtempSync(resolve(tmpdir(), 'plg-backend-packaging-'));
  if (dirname(fixture) !== resolve(tmpdir())) throw new Error('Unexpected packaging fixture path');
  try {
    run(fixture);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

function copyGeneratedClient(fixture: string): ReturnType<typeof spawnSync> {
  const dockerfile = readFileSync(resolve(__dirname, '../../../deploy/Dockerfile.backend'), 'utf8');
  const fragment = dockerfile.match(
    /&& api_client=[\s\S]+?&& cp -a "\$api_client\/\." "\$worker_client\/"/,
  )?.[0];
  expect(fragment).toBeDefined();
  const command = fragment!
    .replace(/^&& /, '')
    .replace(/\\\r?\n/g, '')
    .replaceAll('/prod/', './prod/');
  return spawnSync(shell!, ['-ec', command], { cwd: fixture, encoding: 'utf8' });
}

describe.runIf(Boolean(shell))('backend production packaging', () => {
  it('copies generated Prisma runtime files when worker deploy has no generated client yet', () => {
    withPackagingFixture((fixture) => {
      const clientModules = 'node_modules/.pnpm/@prisma+client@6.19.2_fixture/node_modules';
      const apiClient = resolve(fixture, 'prod/api', clientModules, '.prisma/client');
      const workerModules = resolve(fixture, 'prod/worker', clientModules);
      const workerClient = resolve(workerModules, '.prisma/client');
      mkdirSync(apiClient, { recursive: true });
      mkdirSync(workerModules, { recursive: true });
      writeFileSync(resolve(apiClient, 'index.js'), 'generated client runtime');
      writeFileSync(resolve(apiClient, 'schema.prisma'), 'model User { id String @id }');
      writeFileSync(resolve(apiClient, 'query_engine.node'), 'native query engine');
      expect(existsSync(workerClient)).toBe(false);

      const result = copyGeneratedClient(fixture);

      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      for (const filename of ['index.js', 'schema.prisma', 'query_engine.node']) {
        expect(readFileSync(resolve(workerClient, filename))).toEqual(
          readFileSync(resolve(apiClient, filename)),
        );
      }
    });
  });

  it('fails without creating a wildcard directory when the worker Prisma package is missing', () => {
    withPackagingFixture((fixture) => {
      const apiClient = resolve(
        fixture,
        'prod/api/node_modules/.pnpm/@prisma+client@6.19.2_fixture/node_modules/.prisma/client',
      );
      mkdirSync(apiClient, { recursive: true });

      const result = copyGeneratedClient(fixture);

      expect(result.status).not.toBe(0);
      expect(existsSync(resolve(fixture, 'prod/worker'))).toBe(false);
    });
  });
});
