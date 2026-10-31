import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const standaloneApp = join(appRoot, '.next/standalone/apps/web');
const server = join(standaloneApp, 'server.js');

if (!existsSync(server)) {
  throw new Error('Standalone build is missing. Run `pnpm build` before `pnpm start`.');
}

function copyRuntimeAsset(source, destination) {
  if (!existsSync(source)) return;
  mkdirSync(destination, { recursive: true });
  cpSync(source, destination, { force: true, recursive: true });
}

copyRuntimeAsset(join(appRoot, '.next/static'), join(standaloneApp, '.next/static'));
copyRuntimeAsset(join(appRoot, 'public'), join(standaloneApp, 'public'));

process.env.PORT ||= '3130';
process.env.HOSTNAME ||= '0.0.0.0';
await import(pathToFileURL(server).href);
