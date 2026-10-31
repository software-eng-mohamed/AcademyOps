import type { Organization, Prisma, PrismaClient } from '@prisma/client';
import { FIXTURE_ORGANIZATION_CODE } from './constants';
import { deleteArtifact } from './credentials';
import { assertFixtureOrganization, findFixtureOrganization } from './safety';

type TableRow = { table_name: string };

function quotedIdentifier(value: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) throw new Error(`Unsafe database identifier: ${value}`);
  return `"${value}"`;
}

async function lockedOrganization(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<Organization> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM organizations WHERE id = ${organizationId}::uuid FOR UPDATE
  `;
  const organization = rows[0]
    ? await tx.organization.findUnique({ where: { id: rows[0].id } })
    : null;
  if (!organization) throw new Error('Synthetic organization disappeared during cleanup.');
  assertFixtureOrganization(organization);
  return organization;
}

async function deleteTenantRows(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<TableRow[]>`
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'organization_id'
    ORDER BY table_name
  `;
  await tx.$executeRawUnsafe("SET LOCAL session_replication_role = 'replica'");
  for (const { table_name: table } of rows) {
    if (table !== 'organizations') {
      await tx.$executeRawUnsafe(
        `DELETE FROM ${quotedIdentifier(table)} WHERE "organization_id" = $1::uuid`,
        organizationId,
      );
    }
  }
  await tx.$executeRawUnsafe('DELETE FROM organizations WHERE id = $1::uuid', organizationId);
}

export async function cleanFixture(prisma: PrismaClient): Promise<boolean> {
  const organization = await findFixtureOrganization(prisma);
  if (!organization) {
    await deleteArtifact();
    return false;
  }
  try {
    await prisma.$transaction(
      async (tx) => {
        await lockedOrganization(tx, organization.id);
        await deleteTenantRows(tx, organization.id);
      },
      { timeout: 30_000 },
    );
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (text.includes('session_replication_role') || text.includes('42501')) {
      throw new Error('Cleanup requires a PostgreSQL maintenance role; no rows were deleted.');
    }
    throw error;
  }
  await deleteArtifact();
  return true;
}

export function cleanupSummary(deleted: boolean): string {
  return deleted
    ? `${FIXTURE_ORGANIZATION_CODE} synthetic tenant and local credential artifact removed.`
    : `${FIXTURE_ORGANIZATION_CODE} synthetic tenant was already absent.`;
}
