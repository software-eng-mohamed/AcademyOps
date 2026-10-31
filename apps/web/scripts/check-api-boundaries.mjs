import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = join(appRoot, 'src');
const generatedRoot = join(sourceRoot, 'api', 'generated');

function sourceFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return path === generatedRoot ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

const violations = [];
for (const path of sourceFiles(sourceRoot)) {
  const source = readFileSync(path, 'utf8');
  const displayPath = relative(appRoot, path).replaceAll('\\', '/');
  if (/from\s+['"]@academyops\/api-client['"]/.test(source)) {
    violations.push(`${displayPath}: imports the legacy package root`);
  }
  if (source.includes('@academyops/api-client/transport')) {
    violations.push(`${displayPath}: imports the compatibility transport entry`);
  }
  if (!displayPath.startsWith('src/api/') && source.includes('/api/v1')) {
    violations.push(`${displayPath}: contains a handwritten API URL outside src/api`);
  }
  if (displayPath.startsWith('src/api/browser/') && /next\/headers|server-only/.test(source)) {
    violations.push(`${displayPath}: crosses from the browser adapter into server-only code`);
  }
  if (
    displayPath.startsWith('src/api/server/') &&
    /@tanstack\/react-query|api\/browser/.test(source)
  ) {
    violations.push(`${displayPath}: crosses from the server adapter into browser/query code`);
  }
}

if (violations.length) {
  console.error(`API boundary violations:\n${violations.join('\n')}`);
  process.exit(1);
}

console.log('API browser/server/generated/query boundaries are clean.');
