import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

for (const relativePath of ['test-results/load/results', 'test-results/load/gates']) {
  mkdirSync(resolve(process.cwd(), relativePath), { recursive: true });
}

console.log('Load result and gate directories are ready.');
