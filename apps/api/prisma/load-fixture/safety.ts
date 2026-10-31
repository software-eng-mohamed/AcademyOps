import type { Organization, PrismaClient } from '@prisma/client';
import {
  CLEAN_CONFIRMATION,
  DATABASE_CONFIRMATION,
  E2E_ORGANIZATION_CODE,
  E2E_ORGANIZATION_NAME,
  SEED_CONFIRMATION,
} from './constants';

const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);

function positiveInteger(raw: string | undefined, name: string): number {
  const value = Number(raw || '1');
  if (!Number.isInteger(value) || value < 1 || value > 64) {
    throw new Error(`${name} must be an integer from 1 through 64.`);
  }
  return value;
}

export interface FixtureEnvironment {
  runnerCount: number;
  targetOrigin: string;
  revision: string;
  sessionPepper: string;
}

export function targetOrigin(environment = process.env): string {
  const raw = environment.E2E_LOAD_BASE_URL?.trim();
  if (!raw) throw new Error('E2E_LOAD_BASE_URL is required.');
  const target = new URL(raw);
  if (!['http:', 'https:'].includes(target.protocol) || raw !== target.origin) {
    throw new Error('E2E_LOAD_BASE_URL must be an exact HTTP(S) origin.');
  }
  if (!localHosts.has(target.hostname)) {
    const allowed = environment.E2E_LOAD_ALLOWED_ORIGIN?.trim();
    if (environment.E2E_LOAD_REMOTE !== 'synthetic-only' || allowed !== target.origin) {
      throw new Error('Remote fixture requires synthetic-only and an exact allowed origin.');
    }
  }
  return target.origin;
}

function sharedIntent(environment = process.env): FixtureEnvironment {
  if (environment.E2E_FIXTURE_CONFIRM !== 'synthetic-only') {
    throw new Error('E2E_FIXTURE_CONFIRM=synthetic-only is required.');
  }
  if (environment.E2E_LOAD_DATABASE_CONFIRM !== DATABASE_CONFIRMATION) {
    throw new Error(`E2E_LOAD_DATABASE_CONFIRM=${DATABASE_CONFIRMATION} is required.`);
  }
  const sessionPepper = environment.SESSION_PEPPER;
  if (!sessionPepper || sessionPepper.length < 32) throw new Error('SESSION_PEPPER is required.');
  const revision = environment.E2E_LOAD_REVISION?.trim();
  if (!revision || !/^[a-f0-9]{7,64}$/i.test(revision)) {
    throw new Error('E2E_LOAD_REVISION must be the deployed Git revision.');
  }
  return {
    runnerCount: positiveInteger(environment.E2E_LOAD_RUNNER_COUNT, 'E2E_LOAD_RUNNER_COUNT'),
    targetOrigin: targetOrigin(environment),
    revision,
    sessionPepper,
  };
}

export function assertSeedIntent(environment = process.env): FixtureEnvironment {
  if (environment.E2E_LOAD_FIXTURE_CONFIRM !== SEED_CONFIRMATION) {
    throw new Error(`E2E_LOAD_FIXTURE_CONFIRM=${SEED_CONFIRMATION} is required.`);
  }
  return sharedIntent(environment);
}

export function assertCleanIntent(environment = process.env): FixtureEnvironment {
  if (environment.E2E_LOAD_CLEAN_CONFIRM !== CLEAN_CONFIRMATION) {
    throw new Error(`E2E_LOAD_CLEAN_CONFIRM=${CLEAN_CONFIRMATION} is required.`);
  }
  return sharedIntent(environment);
}

export async function assertDisposableOrganization(prisma: PrismaClient): Promise<Organization> {
  const organizations = await prisma.organization.findMany();
  if (
    organizations.length !== 1 ||
    organizations[0]?.code !== E2E_ORGANIZATION_CODE ||
    organizations[0].name !== E2E_ORGANIZATION_NAME
  ) {
    throw new Error(
      'Load fixtures require a database containing only the marker-verified E2E tenant.',
    );
  }
  const [jannaPeople, jannaIdentifiers] = await Promise.all([
    prisma.person.count({
      where: {
        organizationId: organizations[0].id,
        OR: [
          { publicId: { contains: 'janna', mode: 'insensitive' } },
          { name: { contains: 'janna', mode: 'insensitive' } },
        ],
      },
    }),
    prisma.userLoginIdentifier.count({
      where: {
        organizationId: organizations[0].id,
        normalizedValue: { contains: 'janna', mode: 'insensitive' },
      },
    }),
  ]);
  if (jannaPeople || jannaIdentifiers) {
    throw new Error('Refusing a database containing the forbidden Janna/real-tenant marker.');
  }
  return organizations[0];
}
