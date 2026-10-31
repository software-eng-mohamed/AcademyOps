import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const scenarios = [
  'identity',
  'business',
  'domain',
  'finance',
  'paymob',
  'imports',
  'iam',
  'learning',
  'platform',
];
const repetitions = Number(process.env.ROUTE_MATRIX_REPETITIONS ?? 2);

if (!Number.isInteger(repetitions) || repetitions < 2 || repetitions > 5) {
  throw new Error('ROUTE_MATRIX_REPETITIONS must be an integer between 2 and 5.');
}

const expectedRoutes = openApiRouteKeys();
const observations = new Map(expectedRoutes.map((key) => [key, 0]));

for (let repetition = 1; repetition <= repetitions; repetition += 1) {
  for (const scenario of scenarios) {
    const result = spawnSync(
      process.execPath,
      [
        '-r',
        'ts-node/register/transpile-only',
        'test/http/release-critical-http.child.ts',
        scenario,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        maxBuffer: 20 * 1024 * 1024,
        timeout: 180_000,
      },
    );
    if (result.status !== 0) {
      process.stdout.write(result.stdout ?? '');
      process.stderr.write(result.stderr ?? '');
      throw new Error(`HTTP route scenario failed: ${scenario} (repetition ${repetition})`);
    }
    const evidence = parseEvidence(result.stdout);
    for (const key of evidence.routeKeys) {
      if (!observations.has(key)) throw new Error(`Scenario emitted an unknown route: ${key}`);
      observations.set(key, (observations.get(key) ?? 0) + 1);
    }
    console.log(
      `HTTP route matrix ${repetition}/${repetitions}: ${scenario} covered ${evidence.routeKeys.length} operations.`,
    );
  }
}

const underused = [...observations].filter(([, count]) => count < repetitions);
if (underused.length) {
  throw new Error(
    `Every OpenAPI operation must succeed in every repetition:\n${underused
      .map(([key, count]) => `${key}: ${count}/${repetitions}`)
      .join('\n')}`,
  );
}

console.log(
  JSON.stringify({
    successfulHttpInvocations: expectedRoutes.length * repetitions,
    uniqueOpenApiOperations: expectedRoutes.length,
    repetitions,
  }),
);

function openApiRouteKeys() {
  const spec = JSON.parse(
    readFileSync(resolve(process.cwd(), '../../packages/api-client/openapi.json'), 'utf8'),
  );
  const methods = new Set(['get', 'post', 'put', 'patch', 'delete']);
  return Object.entries(spec.paths ?? {})
    .flatMap(([path, item]) =>
      Object.keys(item)
        .filter((method) => methods.has(method))
        .map((method) => `${method.toUpperCase()} ${path}`),
    )
    .sort();
}

function parseEvidence(stdout) {
  for (const line of stdout.trim().split(/\r?\n/).reverse()) {
    if (!line.startsWith('{')) continue;
    const parsed = JSON.parse(line);
    if (Array.isArray(parsed.routeKeys)) return parsed;
  }
  throw new Error(`Scenario did not emit route evidence:\n${stdout}`);
}
