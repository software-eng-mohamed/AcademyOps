import { chmod, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { userInfo } from 'node:os';
import { generateTotpSecret } from '../../src/iam/auth/totp';
import {
  FIXTURE_MARKER,
  FIXTURE_ORGANIZATION_CODE,
  FIXTURE_ROLES,
  MFA_ROLES,
  type FixtureRole,
} from './constants';
import type { FixtureAccountSecret, FixtureArtifact } from './types';

export const ARTIFACT_PATH = resolve(
  __dirname,
  '../../../..',
  process.env.E2E_CREDENTIALS_FILE?.trim() || 'test-results/e2e/fixtures/credentials.json',
);

function password(): string {
  return `${randomBytes(24).toString('base64url')}#aA1`;
}

function account(role: FixtureRole): FixtureAccountSecret {
  return {
    email: `${role.replace('_', '-')}+synthetic@e2e.invalid`,
    password: password(),
    ...(MFA_ROLES.has(role) ? { totpSecret: generateTotpSecret() } : {}),
  };
}

function validEntry(value: unknown, role: FixtureRole): value is FixtureAccountSecret {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<FixtureAccountSecret>;
  return (
    Boolean(entry.email?.endsWith('@e2e.invalid')) &&
    (entry.password?.length ?? 0) >= 20 &&
    (!MFA_ROLES.has(role) || (entry.totpSecret?.length ?? 0) >= 16)
  );
}

function validEnvelope(value: unknown): value is Omit<FixtureArtifact, 'accounts'> & {
  accounts: Partial<Record<FixtureRole, FixtureAccountSecret>>;
} {
  if (!value || typeof value !== 'object') return false;
  const artifact = value as Partial<FixtureArtifact>;
  return (
    artifact.marker === FIXTURE_MARKER &&
    artifact.version === 1 &&
    artifact.organizationCode === FIXTURE_ORGANIZATION_CODE &&
    Boolean(artifact.accounts)
  );
}

async function protectArtifact(): Promise<void> {
  await chmod(ARTIFACT_PATH, 0o600);
  if (process.platform !== 'win32') return;
  // Task runners can filter environment variables; use the actual OS account for the ACL.
  const owner = userInfo().username;
  execFileSync('icacls.exe', [ARTIFACT_PATH, '/inheritance:r', '/grant:r', `${owner}:(F)`], {
    stdio: 'ignore',
  });
}

export async function loadOrCreateArtifact(): Promise<FixtureArtifact> {
  try {
    const parsed: unknown = JSON.parse(await readFile(ARTIFACT_PATH, 'utf8'));
    if (!validEnvelope(parsed)) throw new Error('Existing E2E credential artifact is invalid.');
    const accounts = Object.fromEntries(
      FIXTURE_ROLES.map((role) => {
        const existing = parsed.accounts[role];
        return [role, validEntry(existing, role) ? existing : account(role)];
      }),
    ) as Record<FixtureRole, FixtureAccountSecret>;
    await protectArtifact();
    return { ...parsed, accounts };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const accounts = Object.fromEntries(FIXTURE_ROLES.map((role) => [role, account(role)])) as Record<
    FixtureRole,
    FixtureAccountSecret
  >;
  return {
    marker: FIXTURE_MARKER,
    version: 1,
    organizationCode: FIXTURE_ORGANIZATION_CODE,
    generatedAt: new Date().toISOString(),
    accounts,
  };
}

export async function writeArtifact(artifact: FixtureArtifact): Promise<void> {
  await mkdir(dirname(ARTIFACT_PATH), { recursive: true });
  await writeFile(ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await protectArtifact();
}

export async function deleteArtifact(): Promise<void> {
  await unlink(ARTIFACT_PATH).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
}
