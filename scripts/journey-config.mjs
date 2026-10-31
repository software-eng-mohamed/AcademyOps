import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const syntheticTenant = Object.freeze({
  code: 'E2EACADEMY',
  name: '[SYNTHETIC E2E] AcademyOps',
  marker: 'plg-synthetic-e2e-v1',
});
const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
const rootDirectory = fileURLToPath(new URL('../', import.meta.url));

export class JourneySafetyError extends Error {}

function parseLocalUrl(raw, variable, protocols) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new JourneySafetyError(`${variable} must be supplied as an explicit URL.`);
  }
  if (!protocols.includes(url.protocol) || !loopbackHosts.has(url.hostname)) {
    throw new JourneySafetyError(`${variable} must use a permitted protocol and a loopback host.`);
  }
  if (url.hash) throw new JourneySafetyError(`${variable} must not contain a fragment.`);
  return url;
}

export function journeyConfig(environment = process.env) {
  if (environment.NODE_ENV !== 'test' || environment.E2E_FIXTURE_CONFIRM !== 'synthetic-only') {
    throw new JourneySafetyError('Set NODE_ENV=test and E2E_FIXTURE_CONFIRM=synthetic-only.');
  }
  if (
    environment.E2E_ORGANIZATION_CODE &&
    environment.E2E_ORGANIZATION_CODE !== syntheticTenant.code
  ) {
    throw new JourneySafetyError('Journey recording is restricted to the E2EACADEMY fixture.');
  }
  const web = parseLocalUrl(environment.E2E_BASE_URL, 'E2E_BASE_URL', ['http:', 'https:']);
  if (web.username || web.password || web.search || web.pathname !== '/') {
    throw new JourneySafetyError(
      'E2E_BASE_URL must be a plain origin without credentials or a path.',
    );
  }
  const database = parseLocalUrl(environment.DATABASE_URL, 'DATABASE_URL', [
    'postgres:',
    'postgresql:',
  ]);
  if (
    !/(?:^|[_-])(?:test|e2e|verification|verify|journey)(?:[_-]|$)/i.test(
      database.pathname.slice(1),
    )
  ) {
    throw new JourneySafetyError(
      'DATABASE_URL must name a dedicated test, e2e, or verification database.',
    );
  }
  const allowedParameters = new Set([
    'schema',
    'connection_limit',
    'pool_timeout',
    'connect_timeout',
  ]);
  if ([...database.searchParams.keys()].some((key) => !allowedParameters.has(key))) {
    throw new JourneySafetyError('DATABASE_URL contains unsupported connection parameters.');
  }
  return {
    baseUrl: web.origin,
    databaseUrl: database.href,
    locale: environment.E2E_LOCALE === 'ar' ? 'ar' : 'en',
    credentialsFile: resolve(
      rootDirectory,
      environment.E2E_CREDENTIALS_FILE || 'test-results/e2e/fixtures/credentials.json',
    ),
    outputDirectory: resolve(
      rootDirectory,
      environment.JOURNEY_OUTPUT_DIR || 'test-results/journey-recordings',
    ),
    artifactDirectory: environment.JOURNEY_ARTIFACT_DIR
      ? resolve(rootDirectory, environment.JOURNEY_ARTIFACT_DIR)
      : null,
  };
}

export function fixtureCredentials(artifact) {
  if (
    artifact?.version !== 1 ||
    artifact?.marker !== syntheticTenant.marker ||
    artifact?.organizationCode !== syntheticTenant.code
  ) {
    throw new JourneySafetyError('A marker-verified synthetic credential artifact is required.');
  }
  const accounts = {};
  for (const role of ['owner', 'student']) {
    const entry = artifact.accounts?.[role];
    if (
      typeof entry?.email !== 'string' ||
      !entry.email.endsWith('@e2e.invalid') ||
      typeof entry.password !== 'string' ||
      entry.password.length < 20 ||
      (role === 'owner' && !/^[A-Z2-7]{16,}={0,6}$/i.test(entry.totpSecret ?? ''))
    ) {
      throw new JourneySafetyError(`The synthetic ${role} account is missing or invalid.`);
    }
    accounts[role] = { ...entry };
  }
  return accounts;
}

export function readFixtureCredentials(path) {
  let artifact;
  try {
    artifact = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new JourneySafetyError('Load the synthetic E2E fixture before recording a journey.');
  }
  return fixtureCredentials(artifact);
}

export function assertSyntheticOrganization(organization, expectedId) {
  if (
    organization?.code !== syntheticTenant.code ||
    organization?.name !== syntheticTenant.name ||
    typeof organization?.id !== 'string' ||
    !organization.id ||
    (expectedId && organization.id !== expectedId)
  ) {
    throw new JourneySafetyError(
      'The target does not match the verified local synthetic organization.',
    );
  }
}
