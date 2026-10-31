import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { environmentFilePaths } from '../src/config/environment-files';

afterEach(() => vi.unstubAllEnvs());

describe('workspace environment file discovery', () => {
  it('finds the app-specific and repository-root files from the API package', () => {
    const packageDirectory = resolve('workspace/apps/api');

    expect(environmentFilePaths(packageDirectory, 'development')).toContain(
      resolve('workspace/apps/api/.env'),
    );
    expect(environmentFilePaths(packageDirectory, 'development')).toContain(
      resolve('workspace/.env'),
    );
  });

  it('finds the API file and repository-root file from the worker package', () => {
    const packageDirectory = resolve('workspace/apps/worker');

    expect(environmentFilePaths(packageDirectory, 'development')).toContain(
      resolve('workspace/apps/api/.env'),
    );
    expect(environmentFilePaths(packageDirectory, 'development')).toContain(
      resolve('workspace/.env'),
    );
  });

  it('isolates test services from developer and deployment environment files', () => {
    for (const packageDirectory of ['workspace/apps/api', 'workspace/apps/worker']) {
      const paths = environmentFilePaths(resolve(packageDirectory), 'test');

      expect(paths).toContain(resolve('workspace/apps/api/.env.test'));
      expect(paths).toContain(resolve('workspace/.env.test'));
      expect(paths.every((candidate) => candidate.endsWith('.env.test'))).toBe(true);
      expect(paths).not.toContain(resolve('workspace/apps/api/.env'));
      expect(paths).not.toContain(resolve('workspace/.env'));
    }
  });

  it('keeps production-mode tests isolated from ordinary environment files', () => {
    vi.stubEnv('VITEST', 'true');
    vi.stubEnv('NODE_ENV', 'production');

    const paths = environmentFilePaths(resolve('workspace/apps/api'));

    expect(paths.every((candidate) => candidate.endsWith('.env.test'))).toBe(true);
    expect(paths).not.toContain(resolve('workspace/apps/api/.env'));
  });
});
