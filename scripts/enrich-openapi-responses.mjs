import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGenerator } from 'ts-json-schema-generator';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDirectory, '..');
const openApiPath = path.join(workspaceRoot, 'packages', 'api-client', 'openapi.json');
const responseTypesPath = path.join(
  workspaceRoot,
  'apps',
  'api',
  'src',
  'openapi-response-types.generated.ts',
);
const metadataPath = path.join(workspaceRoot, 'tmp', 'openapi-response-types.json');
const surfaceManifestPath = path.join(workspaceRoot, 'docs', 'api-operation-surfaces.json');
const tsconfigPath = path.join(workspaceRoot, 'apps', 'api', 'tsconfig.json');

const document = JSON.parse(fs.readFileSync(openApiPath, 'utf8'));
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
const surfaceManifest = JSON.parse(fs.readFileSync(surfaceManifestPath, 'utf8'));
const responseSchema = createGenerator({
  additionalProperties: false,
  expose: 'export',
  functions: 'hide',
  jsDoc: 'extended',
  path: responseTypesPath,
  skipTypeCheck: true,
  sortProps: true,
  topRef: true,
  tsconfig: tsconfigPath,
  type: '*',
}).createSchema('*');

const definitions = responseSchema.definitions ?? {};
const componentPrefix = 'Response_';

function upgradeNullable(value) {
  if (Array.isArray(value)) return value.map(upgradeNullable);
  if (!value || typeof value !== 'object') return value;

  const upgraded = Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'nullable')
      .map(([key, entry]) => [key, upgradeNullable(entry)]),
  );
  if (value.nullable !== true) return upgraded;

  if (Array.isArray(upgraded.type)) {
    if (!upgraded.type.includes('null')) upgraded.type.push('null');
    return upgraded;
  }
  if (typeof upgraded.type === 'string') {
    upgraded.type = [upgraded.type, 'null'];
    return upgraded;
  }
  if (Array.isArray(upgraded.anyOf)) {
    upgraded.anyOf.push({ type: 'null' });
    return upgraded;
  }
  if (Array.isArray(upgraded.oneOf)) {
    upgraded.oneOf.push({ type: 'null' });
    return upgraded;
  }
  if (upgraded.$ref) {
    const reference = upgraded.$ref;
    delete upgraded.$ref;
    upgraded.anyOf = [{ $ref: reference }, { type: 'null' }];
    return upgraded;
  }
  upgraded.type = ['object', 'null'];
  return upgraded;
}

function rewriteSchema(value) {
  if (Array.isArray(value)) return value.map(rewriteSchema);
  if (!value || typeof value !== 'object') return value;
  const rewritten = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === '$schema' || key === 'definitions') continue;
    if (key === '$ref' && typeof entry === 'string') {
      rewritten.$ref = entry.replace('#/definitions/', `#/components/schemas/${componentPrefix}`);
      continue;
    }
    if (key === 'const') {
      rewritten.enum = [entry];
      continue;
    }
    rewritten[key] = rewriteSchema(entry);
  }
  return rewritten;
}

function isMeaningfulSchema(schema) {
  if (!schema || typeof schema !== 'object' || !Object.keys(schema).length) return false;
  if (typeof schema.$ref === 'string' && schema.$ref.startsWith('#/components/schemas/')) {
    const name = schema.$ref.slice('#/components/schemas/'.length);
    return isMeaningfulSchema(document.components?.schemas?.[name]);
  }
  if (schema.type !== 'object') return true;
  return Boolean(
    schema.properties ||
    schema.additionalProperties ||
    schema.allOf ||
    schema.anyOf ||
    schema.oneOf,
  );
}

document.components ??= {};
document.components.schemas ??= {};
for (const [name, schema] of Object.entries(definitions)) {
  document.components.schemas[`${componentPrefix}${name}`] = rewriteSchema(schema);
}

let jsonResponses = 0;
let retainedJsonResponses = 0;
let noContentResponses = 0;
let binaryResponses = 0;
for (const record of metadata) {
  const operation = document.paths?.[record.path]?.[record.method];
  if (!operation || operation.operationId !== record.operationId) {
    throw new Error(`OpenAPI operation drifted while documenting ${record.operationId}.`);
  }
  const successEntries = Object.entries(operation.responses ?? {}).filter(([status]) =>
    /^2\d\d$/.test(status),
  );
  if (!successEntries.length) {
    throw new Error(`${record.operationId} has no successful response.`);
  }

  operation['x-plg-response-kind'] = record.isBinary
    ? 'binary'
    : record.isVoid
      ? 'no-content'
      : 'json';
  const surface = surfaceManifest.operations?.[record.operationId];
  if (!surface || surface === 'unclassified') {
    throw new Error(`${record.operationId} has no classified product surface.`);
  }
  operation['x-plg-surface'] = surface;

  for (const [, response] of successEntries) {
    response.description ||= `${record.operationId} successful response`;
    if (record.isVoid) {
      delete response.content;
      noContentResponses += 1;
      continue;
    }
    if (record.isBinary) {
      response.content = {
        'application/octet-stream': { schema: { format: 'binary', type: 'string' } },
      };
      binaryResponses += 1;
      continue;
    }
    const componentName = `${componentPrefix}${record.alias}`;
    if (!document.components.schemas[componentName]) {
      throw new Error(`Generated schema ${componentName} is missing for ${record.operationId}.`);
    }
    const existingSchema = response.content?.['application/json']?.schema;
    if (isMeaningfulSchema(existingSchema)) {
      retainedJsonResponses += 1;
    } else {
      response.content = {
        'application/json': { schema: { $ref: `#/components/schemas/${componentName}` } },
      };
    }
    jsonResponses += 1;
  }
}

const documentedOperationIds = new Set(metadata.map(({ operationId }) => operationId));
for (const operationId of Object.keys(surfaceManifest.operations ?? {})) {
  if (!documentedOperationIds.has(operationId)) {
    throw new Error(`${operationId} is stale in docs/api-operation-surfaces.json.`);
  }
}

const upgradedDocument = upgradeNullable(document);
upgradedDocument.openapi = '3.1.0';
upgradedDocument.jsonSchemaDialect = 'https://json-schema.org/draft/2020-12/schema';

fs.writeFileSync(openApiPath, `${JSON.stringify(upgradedDocument, null, 2)}\n`, 'utf8');
console.log(
  `Documented ${jsonResponses} JSON (${retainedJsonResponses} explicit), ${noContentResponses} no-content and ${binaryResponses} binary successful responses.`,
);
