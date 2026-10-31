import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';

if (process.env.NODE_ENV !== 'production') {
  const filename =
    process.env.NODE_ENV === 'test' || process.env.VITEST === 'true' ? '.env.test' : '.env';
  const localEnvironmentFiles = [
    resolve(process.cwd(), filename),
    resolve(process.cwd(), '../api', filename),
    resolve(process.cwd(), '../..', filename),
    resolve(process.cwd(), 'apps/api', filename),
  ];
  const localEnvironmentFile = localEnvironmentFiles.find((candidate) => existsSync(candidate));
  if (localEnvironmentFile) {
    config({ path: localEnvironmentFile });
  }
}
