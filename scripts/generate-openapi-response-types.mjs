import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDirectory, '..');
const apiRoot = path.join(workspaceRoot, 'apps', 'api');
const apiSourceRoot = path.join(apiRoot, 'src');
const openApiPath = path.join(workspaceRoot, 'packages', 'api-client', 'openapi.json');
const outputPath = path.join(apiSourceRoot, 'openapi-response-types.generated.ts');
const metadataPath = path.join(workspaceRoot, 'tmp', 'openapi-response-types.json');

const document = JSON.parse(fs.readFileSync(openApiPath, 'utf8'));
const operations = [];
for (const [routePath, pathItem] of Object.entries(document.paths ?? {})) {
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    const operation = pathItem?.[method];
    if (!operation?.operationId) continue;
    operations.push({
      method,
      operationId: operation.operationId,
      path: routePath,
      tags: operation.tags ?? [],
    });
  }
}

const configPath = ts.findConfigFile(apiRoot, ts.sys.fileExists, 'tsconfig.json');
if (!configPath) throw new Error('apps/api/tsconfig.json was not found.');
const rawConfig = ts.readConfigFile(configPath, ts.sys.readFile);
if (rawConfig.error) {
  throw new Error(ts.flattenDiagnosticMessageText(rawConfig.error.messageText, '\n'));
}
const parsedConfig = ts.parseJsonConfigFileContent(
  rawConfig.config,
  ts.sys,
  path.dirname(configPath),
);
const program = ts.createProgram(parsedConfig.fileNames, parsedConfig.options);
const checker = program.getTypeChecker();
const controllerMethods = new Map();

for (const sourceFile of program.getSourceFiles()) {
  if (!sourceFile.fileName.endsWith('.controller.ts')) continue;
  for (const statement of sourceFile.statements) {
    if (!ts.isClassDeclaration(statement) || !statement.name) continue;
    for (const member of statement.members) {
      if (!ts.isMethodDeclaration(member) || !member.name) continue;
      const signature = checker.getSignatureFromDeclaration(member);
      if (!signature) continue;
      controllerMethods.set(`${statement.name.text}.${member.name.getText(sourceFile)}`, {
        declaration: member,
        returnType: checker.getReturnTypeOfSignature(signature),
      });
    }
  }
}

const records = [];
const referencedModules = new Set();
const typeFlags =
  ts.TypeFormatFlags.NoTruncation |
  ts.TypeFormatFlags.UseStructuralFallback |
  ts.TypeFormatFlags.UseFullyQualifiedType |
  ts.TypeFormatFlags.WriteArrayAsGenericType |
  ts.TypeFormatFlags.InTypeAlias;

function isVoidLike(type) {
  if (type.isUnion()) return type.types.every(isVoidLike);
  return (type.flags & (ts.TypeFlags.Void | ts.TypeFlags.Undefined | ts.TypeFlags.Never)) !== 0;
}

for (const operation of operations) {
  const match = /^(.*)_([^_]+)_v\d+$/.exec(operation.operationId);
  if (!match) throw new Error(`Unsupported operation id: ${operation.operationId}`);
  const [, controllerName, methodName] = match;
  const controllerMethod = controllerMethods.get(`${controllerName}.${methodName}`);
  if (!controllerMethod) {
    throw new Error(`No controller method found for ${operation.operationId}`);
  }

  const awaited =
    checker.getAwaitedType(controllerMethod.returnType) ?? controllerMethod.returnType;
  const isVoid = isVoidLike(awaited);
  const rawType = checker.typeToString(awaited, undefined, typeFlags);
  const isBinary = rawType.includes('StreamableFile');
  if (!isVoid && !isBinary) {
    for (const importMatch of rawType.matchAll(/import\("([^"]+)"\)\.[A-Za-z_$][\w$]*/g)) {
      referencedModules.add(importMatch[1]);
    }
  }
  records.push({
    ...operation,
    alias: `${operation.operationId.replace(/_v\d+$/, '')}Response`,
    isBinary,
    isVoid,
    rawType,
  });
}

const moduleAliases = new Map(
  [...referencedModules]
    .sort((left, right) => left.localeCompare(right))
    .map((modulePath, index) => [modulePath, `ResponseType${index}`]),
);

function moduleSpecifier(modulePath) {
  const normalized = modulePath.replaceAll('\\', '/');
  const nodeModulesMarker = '/node_modules/';
  if (normalized.includes(nodeModulesMarker)) {
    return normalized
      .slice(normalized.lastIndexOf(nodeModulesMarker) + nodeModulesMarker.length)
      .replace(/\/index$/, '');
  }
  if (!path.isAbsolute(modulePath)) return modulePath;
  let relative = path.relative(path.dirname(outputPath), modulePath).replaceAll('\\', '/');
  if (!relative.startsWith('.')) relative = `./${relative}`;
  return relative;
}

function renderType(rawType) {
  return (
    rawType
      .replace(
        /import\("([^"]+)"\)\.([A-Za-z_$][\w$]*)/g,
        (_match, modulePath, exportedName) => `${moduleAliases.get(modulePath)}.${exportedName}`,
      )
      // Prisma.Decimal exposes a class type, but its JSON representation is a decimal string.
      .replace(/\bResponseType\d+\.Decimal\b/g, 'string')
      // Arbitrary Prisma JSON is intentionally unknown to consumers until a domain DTO narrows it.
      .replace(/\bResponseType\d+\.(?:Input)?JsonValue\b/g, 'unknown')
  );
}

const lines = [
  '/* eslint-disable */',
  '/**',
  ' * Generated from the inferred return types of the NestJS controllers.',
  ' * Do not edit manually. Run `pnpm --filter @academyops/api openapi:responses`.',
  ' */',
  '',
];
for (const [modulePath, alias] of moduleAliases) {
  lines.push(`import type * as ${alias} from '${moduleSpecifier(modulePath)}';`);
}
if (moduleAliases.size) lines.push('');
for (const record of records) {
  if (record.isVoid || record.isBinary) continue;
  lines.push(`export type ${record.alias} = ${renderType(record.rawType)};`, '');
}

fs.writeFileSync(outputPath, `${lines.join('\n').trimEnd()}\n`, 'utf8');
fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
fs.writeFileSync(
  metadataPath,
  `${JSON.stringify(
    records.map(({ alias, isBinary, isVoid, method, operationId, path: routePath, tags }) => ({
      alias,
      isBinary,
      isVoid,
      method,
      operationId,
      path: routePath,
      tags,
    })),
    null,
    2,
  )}\n`,
  'utf8',
);

console.log(
  `Generated ${records.filter(({ isBinary, isVoid }) => !isBinary && !isVoid).length} response types (${records.filter(({ isVoid }) => isVoid).length} no-content, ${records.filter(({ isBinary }) => isBinary).length} binary).`,
);
