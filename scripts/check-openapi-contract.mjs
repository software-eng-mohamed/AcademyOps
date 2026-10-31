import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDirectory, '..');
const openApiPath = path.join(workspaceRoot, 'packages', 'api-client', 'openapi.json');
const manifestPath = path.join(workspaceRoot, 'docs', 'api-operation-surfaces.json');
const document = JSON.parse(fs.readFileSync(openApiPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const errors = [];
const operations = [];
const allowedKinds = new Set(['json', 'no-content', 'binary']);
const allowedSurfaces = new Set(
  Object.keys(manifest.surfaceDescriptions ?? {}).filter((surface) => surface !== 'unclassified'),
);

if (document.openapi !== '3.1.0') errors.push(`Expected OpenAPI 3.1.0, found ${document.openapi}.`);
if (!document.jsonSchemaDialect) errors.push('OpenAPI 3.1 document is missing jsonSchemaDialect.');

for (const [routePath, pathItem] of Object.entries(document.paths ?? {})) {
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    const operation = pathItem?.[method];
    if (!operation) continue;
    const label = operation.operationId ?? `${method.toUpperCase()} ${routePath}`;
    if (!operation.operationId) errors.push(`${label} is missing operationId.`);
    operations.push({ label, method, operation, path: routePath });
  }
}

const operationIds = operations.map(({ operation }) => operation.operationId).filter(Boolean);
const duplicates = operationIds.filter(
  (operationId, index) => operationIds.indexOf(operationId) !== index,
);
if (duplicates.length)
  errors.push(`Duplicate operation IDs: ${[...new Set(duplicates)].join(', ')}.`);

const manifestIds = Object.keys(manifest.operations ?? {});
for (const operationId of operationIds) {
  if (!(operationId in (manifest.operations ?? {}))) {
    errors.push(`${operationId} is missing from docs/api-operation-surfaces.json.`);
  }
}
for (const operationId of manifestIds) {
  if (!operationIds.includes(operationId))
    errors.push(`${operationId} is stale in the surface manifest.`);
}

const schemas = document.components?.schemas ?? {};
for (const { label, operation } of operations) {
  const responseKind = operation['x-plg-response-kind'];
  const surface = operation['x-plg-surface'];
  const expectedSurface = manifest.operations?.[operation.operationId];
  if (!allowedKinds.has(responseKind))
    errors.push(`${label} has invalid response kind ${responseKind}.`);
  if (!allowedSurfaces.has(surface))
    errors.push(`${label} has invalid or unclassified surface ${surface}.`);
  if (surface !== expectedSurface) {
    errors.push(`${label} surface ${surface} does not match manifest value ${expectedSurface}.`);
  }

  const successes = Object.entries(operation.responses ?? {}).filter(([status]) =>
    /^2\d\d$/.test(status),
  );
  if (!successes.length) {
    errors.push(`${label} has no successful response.`);
    continue;
  }
  for (const [status, response] of successes) {
    const responseLabel = `${label} ${status}`;
    if (responseKind === 'no-content') {
      if (response.content) errors.push(`${responseLabel} is no-content but declares content.`);
      continue;
    }
    if (responseKind === 'binary') {
      const schema = response.content?.['application/octet-stream']?.schema;
      if (schema?.type !== 'string' || schema?.format !== 'binary') {
        errors.push(`${responseLabel} is missing its binary schema.`);
      }
      continue;
    }
    const schema = response.content?.['application/json']?.schema;
    if (!schema || !Object.keys(schema).length) {
      errors.push(`${responseLabel} is missing its JSON schema.`);
      continue;
    }
    if (schema.$ref?.startsWith('#/components/schemas/')) {
      const componentName = schema.$ref.slice('#/components/schemas/'.length);
      const component = schemas[componentName];
      if (!component) errors.push(`${responseLabel} references missing schema ${componentName}.`);
      else if (!Object.keys(component).length)
        errors.push(`${responseLabel} resolves to an empty schema.`);
    }
  }
}

function inspect(value, location = '#') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspect(entry, `${location}/${index}`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  if ('nullable' in value) errors.push(`${location} still uses OpenAPI 3.0 nullable.`);
  if (typeof value.$ref === 'string' && value.$ref.startsWith('#/components/schemas/')) {
    const componentName = value.$ref.slice('#/components/schemas/'.length);
    if (!(componentName in schemas))
      errors.push(`${location} references missing schema ${componentName}.`);
  }
  for (const [key, entry] of Object.entries(value)) inspect(entry, `${location}/${key}`);
}
inspect(document);

if (errors.length) {
  console.error(`OpenAPI contract check failed with ${errors.length} error(s):`);
  errors.slice(0, 100).forEach((error) => console.error(`- ${error}`));
  if (errors.length > 100) console.error(`- ...and ${errors.length - 100} more.`);
  process.exit(1);
}

const kindCounts = Object.fromEntries(
  [...allowedKinds].map((kind) => [
    kind,
    operations.filter(({ operation }) => operation['x-plg-response-kind'] === kind).length,
  ]),
);
console.log(
  `OpenAPI contract is complete: ${Object.keys(document.paths ?? {}).length} paths, ${operations.length} operations (${kindCounts.json} JSON, ${kindCounts['no-content']} no-content, ${kindCounts.binary} binary).`,
);
