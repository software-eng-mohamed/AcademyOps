import { resolve } from 'node:path';

export function environmentFilePaths(
  cwd = process.cwd(),
  nodeEnvironment = process.env.VITEST === 'true' ? 'test' : process.env.NODE_ENV,
): string[] {
  const filename = nodeEnvironment === 'test' ? '.env.test' : '.env';
  return [
    resolve(cwd, filename),
    resolve(cwd, '../api', filename),
    resolve(cwd, '../..', filename),
    resolve(cwd, 'apps/api', filename),
  ].filter((candidate, index, paths) => paths.indexOf(candidate) === index);
}
