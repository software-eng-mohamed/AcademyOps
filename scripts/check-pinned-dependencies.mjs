import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const dependencySections = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];
const ignoredDirectories = new Set([
  '.git',
  '.next',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
  'tmp',
  'work',
]);
const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function isPinnedDependency(specifier) {
  return specifier === 'workspace:*' || exactVersion.test(specifier);
}

function manifests(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name))
        found.push(...manifests(join(directory, entry.name)));
    } else if (entry.name === 'package.json') {
      found.push(join(directory, entry.name));
    }
  }
  return found;
}

function violations(root) {
  return manifests(root).flatMap((path) => {
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    return dependencySections.flatMap((section) =>
      Object.entries(manifest[section] || {}).flatMap(([name, specifier]) =>
        typeof specifier === 'string' && isPinnedDependency(specifier)
          ? []
          : [`${relative(root, path)}:${section}:${name}=${String(specifier)}`],
      ),
    );
  });
}

const root = resolve(process.cwd());
const found = violations(root);
if (found.length) {
  found.forEach((entry) => process.stderr.write(`Unpinned dependency: ${entry}\n`));
  process.exitCode = 1;
} else {
  process.stdout.write('All external workspace dependencies use exact versions.\n');
}
