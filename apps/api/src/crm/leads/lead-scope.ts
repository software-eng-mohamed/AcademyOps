import { Prisma } from '@prisma/client';
import type { AccessContext, PermissionCode } from '@academyops/contracts';

// Keep ORM reads and aggregate SQL on the same permission alternatives.
// SQL callers must use the `lead` alias and also constrain organization_id.
export function leadScope(access: AccessContext, permission: PermissionCode) {
  const grants = access.grants.get(permission);
  if (grants?.has('O')) return { where: {} as Prisma.LeadWhereInput, sql: Prisma.sql`TRUE` };

  const alternatives: Array<{ where: Prisma.LeadWhereInput; sql: Prisma.Sql }> = [];
  if (grants?.has('B')) {
    const branchIds = [...access.branchIds];
    alternatives.push({
      where: { branchId: { in: branchIds } },
      sql: Prisma.sql`lead.branch_id = ANY(${branchIds}::uuid[])`,
    });
  }
  if (grants?.has('A')) {
    const resourceIds = [...access.assignedResourceIds];
    alternatives.push({
      where: { OR: [{ assignedUserId: access.actorUserId }, { id: { in: resourceIds } }] },
      sql: Prisma.sql`(lead.assigned_user_id = ${access.actorUserId}::uuid
        OR lead.id = ANY(${resourceIds}::uuid[]))`,
    });
  }
  return {
    where: { OR: alternatives.map(({ where }) => where) } satisfies Prisma.LeadWhereInput,
    sql: alternatives.length
      ? Prisma.sql`(${Prisma.join(
          alternatives.map(({ sql }) => sql),
          ' OR ',
        )})`
      : Prisma.sql`FALSE`,
  };
}
