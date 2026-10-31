import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDirectory, '..');
const openApiPath = path.join(workspaceRoot, 'packages', 'api-client', 'openapi.json');
const manifestPath = path.join(workspaceRoot, 'docs', 'api-operation-surfaces.json');
const outputPath = path.join(workspaceRoot, 'docs', 'api-catalog.md');

const document = JSON.parse(fs.readFileSync(openApiPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const operations = [];
for (const [routePath, pathItem] of Object.entries(document.paths ?? {})) {
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    const operation = pathItem?.[method];
    if (!operation?.operationId) continue;
    operations.push({
      method: method.toUpperCase(),
      operationId: operation.operationId,
      path: routePath,
      responseKind: operation['x-plg-response-kind'],
      surface: manifest.operations?.[operation.operationId] ?? 'unclassified',
      tag: operation.tags?.[0] ?? 'untagged',
    });
  }
}
operations.sort(
  (left, right) =>
    left.surface.localeCompare(right.surface) ||
    left.tag.localeCompare(right.tag) ||
    left.path.localeCompare(right.path) ||
    left.method.localeCompare(right.method),
);

const surfaceCounts = Object.fromEntries(
  Object.keys(manifest.surfaceDescriptions ?? {}).map((surface) => [
    surface,
    operations.filter((operation) => operation.surface === surface).length,
  ]),
);
const responseCounts = Object.fromEntries(
  ['json', 'no-content', 'binary'].map((kind) => [
    kind,
    operations.filter((operation) => operation.responseKind === kind).length,
  ]),
);

function markdownTable(headers, rows, rightAligned = new Set()) {
  const widths = headers.map((header, index) =>
    Math.max(header.length, 3, ...rows.map((row) => String(row[index]).length)),
  );
  const row = (cells, header = false) =>
    `| ${cells
      .map((cell, index) =>
        String(cell)[header || !rightAligned.has(index) ? 'padEnd' : 'padStart'](widths[index]),
      )
      .join(' | ')} |`;
  const separator = widths.map((width, index) =>
    rightAligned.has(index) ? `${'-'.repeat(width - 1)}:` : '-'.repeat(width),
  );
  return [row(headers, true), row(separator, true), ...rows.map((cells) => row(cells))];
}

const surfaceRows = Object.entries(manifest.surfaceDescriptions ?? {})
  .filter(([surface]) => surfaceCounts[surface] > 0)
  .map(([surface, description]) => [`\`${surface}\``, surfaceCounts[surface], description]);
const operationRows = operations.map((operation) => [
  `\`${operation.surface}\``,
  operation.tag,
  `\`${operation.method}\``,
  `\`${operation.path}\``,
  `\`${operation.operationId}\``,
  `\`${operation.responseKind}\``,
]);

const lines = [
  '# API operation catalog',
  '',
  'This file is generated from `packages/api-client/openapi.json` and `docs/api-operation-surfaces.json`. It is the implementation inventory for the frontend rebuild; edit the surface manifest, then regenerate this catalog.',
  '',
  'Commands:',
  '',
  '- `pnpm api:generate` regenerates OpenAPI, response contracts, clients, and this catalog.',
  '- `pnpm api:catalog:sync` adds newly discovered operations as `unclassified`.',
  '- `pnpm api:contract:check` rejects missing schemas, drift, or unclassified operations.',
  '',
  '## Coverage',
  '',
  `- Paths: ${Object.keys(document.paths ?? {}).length}`,
  `- Operations: ${operations.length}`,
  `- Responses: ${responseCounts.json} JSON, ${responseCounts['no-content']} no-content, ${responseCounts.binary} binary`,
  '',
  ...markdownTable(['Surface', 'Operations', 'Purpose'], surfaceRows, new Set([1])),
  '',
  '## Operations',
  '',
  ...markdownTable(
    ['Surface', 'Domain', 'Method', 'Path', 'Operation ID', 'Response'],
    operationRows,
  ),
  '',
];

fs.writeFileSync(outputPath, lines.join('\n'), 'utf8');
console.log(`Generated API catalog with ${operations.length} operations.`);
