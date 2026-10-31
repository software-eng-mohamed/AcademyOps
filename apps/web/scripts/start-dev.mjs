import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnvironmentFile } from 'dotenv';
import { waitForDevApi } from './wait-for-dev-api.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnvironmentFile({ path: path.resolve(appRoot, '../../.env'), quiet: true });

const apiBaseUrl = (process.env.API_INTERNAL_URL || 'http://localhost:3001/api/v1').replace(
  /\/$/,
  '',
);
const readinessUrl = new URL(`${apiBaseUrl}/health/ready`);
await waitForDevApi(readinessUrl);

const require = createRequire(import.meta.url);
const nextBin = require.resolve('next/dist/bin/next');
const port = process.env.PORT || '3130';
const nextProcess = spawn(process.execPath, [nextBin, 'dev', '--turbopack', '-p', port], {
  cwd: appRoot,
  env: process.env,
  stdio: 'inherit',
});

let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    stopping = true;
    if (!nextProcess.killed) nextProcess.kill(signal);
  });
}

nextProcess.once('error', (error) => {
  throw error;
});

nextProcess.once('exit', (code) => {
  process.exitCode = code ?? (stopping ? 0 : 1);
});
