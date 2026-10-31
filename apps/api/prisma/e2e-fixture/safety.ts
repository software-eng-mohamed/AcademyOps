import type { Organization, PrismaClient } from '@prisma/client';
import {
  CLEAN_CONFIRMATION,
  FIXTURE_MARKER,
  FIXTURE_ORGANIZATION_CODE,
  FIXTURE_ORGANIZATION_NAME,
} from './constants';
export function assertSyntheticIntent(environment = process.env): void {
  if (environment.E2E_FIXTURE_CONFIRM !== 'synthetic-only') {
    throw new Error('Refusing fixture mutation: set E2E_FIXTURE_CONFIRM=synthetic-only.');
  }
  const requestedCode = environment.E2E_ORGANIZATION_CODE?.trim().toUpperCase();
  if (requestedCode && requestedCode !== FIXTURE_ORGANIZATION_CODE) {
    throw new Error(`Only the fixed ${FIXTURE_ORGANIZATION_CODE} tenant may be mutated.`);
  }
  const databaseUrl = environment.DATABASE_URL;
  if (!databaseUrl || !/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
    throw new Error('DATABASE_URL must be an explicit PostgreSQL URL.');
  }
  if (!environment.MFA_ENCRYPTION_KEY || environment.MFA_ENCRYPTION_KEY.length < 32) {
    throw new Error('MFA_ENCRYPTION_KEY (32+ characters) is required for synthetic staff MFA.');
  }
}
export function assertCleanupIntent(environment = process.env): void {
  assertSyntheticIntent(environment);
  if (environment.E2E_FIXTURE_CLEAN_CONFIRM !== CLEAN_CONFIRMATION) {
    throw new Error(`Cleanup requires E2E_FIXTURE_CLEAN_CONFIRM=${CLEAN_CONFIRMATION}.`);
  }
}
export function assertFixtureOrganization(organization: Organization): void {
  if (
    organization.code !== FIXTURE_ORGANIZATION_CODE ||
    organization.name !== FIXTURE_ORGANIZATION_NAME
  ) {
    throw new Error('Synthetic organization code collision; refusing to mutate existing tenant.');
  }
}
export async function findFixtureOrganization(prisma: PrismaClient): Promise<Organization | null> {
  const organization = await prisma.organization.findUnique({
    where: { code: FIXTURE_ORGANIZATION_CODE },
  });
  if (organization) assertFixtureOrganization(organization);
  return organization;
}
export function fixtureMetadata(): {
  marker: string;
  code: string;
} {
  return { marker: FIXTURE_MARKER, code: FIXTURE_ORGANIZATION_CODE };
}
