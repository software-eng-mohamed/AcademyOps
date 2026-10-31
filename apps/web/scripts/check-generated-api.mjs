import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(appRoot, '../..');
const openapi = JSON.parse(
  readFileSync(join(repositoryRoot, 'packages/api-client/openapi.json'), 'utf8'),
);

function readTypeScriptTree(root) {
  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) return entry.name === 'models' ? [] : readTypeScriptTree(path);
      return entry.name.endsWith('.ts') ? [readFileSync(path, 'utf8')] : [];
    })
    .join('\n');
}

function generatedFunctionName(operationId) {
  const compact = operationId.replace(/_([a-zA-Z0-9])/g, (_, character) => character.toUpperCase());
  return `${compact[0].toLowerCase()}${compact.slice(1)}`;
}

const generatedSource = readTypeScriptTree(join(appRoot, 'src/api/generated'));
const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);
const operations = Object.values(openapi.paths ?? {}).flatMap((pathItem) =>
  Object.entries(pathItem)
    .filter(([method]) => methods.has(method))
    .map(([, operation]) => operation.operationId),
);
const missing = operations.filter((operationId) => {
  const functionName = generatedFunctionName(operationId);
  return !generatedSource.includes(`export const ${functionName} =`);
});

if (missing.length) {
  console.error(`Generated API is missing ${missing.length} operations:\n${missing.join('\n')}`);
  process.exit(1);
}

console.log(`Generated API covers all ${operations.length} OpenAPI operations.`);
