import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const ROLES = ['owner', 'accounts', 'attendance', 'student'] as const;
export type E2ERole = (typeof ROLES)[number];
export const FIXTURE_ROLES = [
  ...ROLES,
  'operations',
  'academic',
  'reception',
  'sales',
  'trainer',
  'otp_operator',
  'no_grant',
  'first_login',
] as const;
export type FixtureRole = (typeof FIXTURE_ROLES)[number];

const localHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function assertTargetAllowed(rawUrl: string, environment: NodeJS.ProcessEnv): URL {
  const target = new URL(rawUrl);
  if (!['http:', 'https:'].includes(target.protocol)) {
    throw new Error('E2E_BASE_URL must use HTTP or HTTPS.');
  }
  if (localHosts.has(target.hostname)) return target;
  if (environment.E2E_ALLOW_REMOTE !== 'synthetic-only') {
    throw new Error('Remote E2E requires E2E_ALLOW_REMOTE=synthetic-only.');
  }
  const allowlistedOrigin = environment.E2E_TARGET_ALLOWLIST?.trim();
  if (!allowlistedOrigin || new URL(allowlistedOrigin).origin !== target.origin) {
    throw new Error('Remote E2E target must exactly match E2E_TARGET_ALLOWLIST origin.');
  }
  if (allowlistedOrigin !== target.origin) {
    throw new Error('E2E_TARGET_ALLOWLIST must be an exact origin without a path or wildcard.');
  }
  return target;
}

const rawBaseUrl = process.env.E2E_BASE_URL?.trim() || 'http://127.0.0.1:3101';
const parsedBaseUrl = assertTargetAllowed(rawBaseUrl, process.env);
export const E2E_BASE_URL = parsedBaseUrl.origin;
export const E2E_LOCALE = process.env.E2E_LOCALE === 'ar' ? 'ar' : 'en';
const requestedOrganizationCode =
  process.env.E2E_ORGANIZATION_CODE?.trim().toUpperCase() || 'E2EACADEMY';
if (requestedOrganizationCode !== 'E2EACADEMY') {
  throw new Error('Browser E2E may authenticate only to the fixed E2EACADEMY organization.');
}
export const E2E_ORGANIZATION_CODE = requestedOrganizationCode;

export interface RoleCredentials {
  email: string;
  password: string;
  totpSecret?: string;
}

function rolePrefix(role: FixtureRole): string {
  return `E2E_${role.toUpperCase()}`;
}

export function credentialsFromArtifact(value: unknown, role: FixtureRole): RoleCredentials | null {
  if (!value || typeof value !== 'object') return null;
  const artifact = value as {
    marker?: unknown;
    organizationCode?: unknown;
    accounts?: Record<string, unknown>;
  };
  if (
    artifact.marker !== 'plg-synthetic-e2e-v1' ||
    artifact.organizationCode !== E2E_ORGANIZATION_CODE
  ) {
    throw new Error('E2E credential artifact tenant marker does not match the selected tenant.');
  }
  const entry = artifact.accounts?.[role];
  if (!entry || typeof entry !== 'object') return null;
  const secret = entry as { email?: unknown; password?: unknown; totpSecret?: unknown };
  if (
    typeof secret.email !== 'string' ||
    !secret.email.endsWith('@e2e.invalid') ||
    typeof secret.password !== 'string' ||
    secret.password.length < 20
  ) {
    return null;
  }
  return {
    email: secret.email,
    password: secret.password,
    ...(typeof secret.totpSecret === 'string' ? { totpSecret: secret.totpSecret } : {}),
  };
}

function artifactCredentials(role: FixtureRole): RoleCredentials | null {
  const path =
    process.env.E2E_CREDENTIALS_FILE ||
    resolve(process.cwd(), 'test-results/e2e/fixtures/credentials.json');
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return credentialsFromArtifact(value, role);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export function credentialsFor(role: FixtureRole): RoleCredentials {
  if (process.env.E2E_FIXTURE_CONFIRM !== 'synthetic-only') {
    throw new Error('Set E2E_FIXTURE_CONFIRM=synthetic-only after loading disposable fixtures.');
  }
  const prefix = rolePrefix(role);
  const email = process.env[`${prefix}_EMAIL`]?.trim();
  const password = process.env[`${prefix}_PASSWORD`];
  const totpSecret = process.env[`${prefix}_TOTP_SECRET`]?.trim();
  const artifact = artifactCredentials(role);
  if (!artifact) {
    throw new Error('Marker-verified synthetic credential artifact is required before auth.');
  }
  if (email && password) {
    if (email !== artifact.email || !email.endsWith('@e2e.invalid')) {
      throw new Error('Credential overrides must match the marker-verified synthetic account.');
    }
    return { email, password, ...(totpSecret ? { totpSecret } : {}) };
  }
  return artifact;
}

export function roleStatePath(role: E2ERole): string {
  return resolve(process.cwd(), `test-results/e2e/.auth/${role}.json`);
}

export function dashboardPath(): string {
  return `/${E2E_LOCALE}/dashboard`;
}
