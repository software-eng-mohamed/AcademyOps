import { spawnSync } from 'node:child_process';
import { extname } from 'node:path';

const packageManager = process.env.npm_execpath;
if (!packageManager) throw new Error('pnpm entrypoint is unavailable');
const nodeEntrypoint = ['.cjs', '.js', '.mjs'].includes(extname(packageManager).toLowerCase());

const result = spawnSync(
  nodeEntrypoint ? process.execPath : packageManager,
  [...(nodeEntrypoint ? [packageManager] : []), 'build'],
  {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      API_ORIGIN: 'https://academy.example.test',
      API_INTERNAL_URL: 'https://academy.example.test/api/v1',
      NEXT_PUBLIC_REALTIME_URL: 'https://academy.example.test',
    },
    stdio: 'inherit',
  },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
