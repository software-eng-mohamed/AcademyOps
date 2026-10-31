import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

type OwnerCounts = { activeOwners: number; targetIsActiveOwner: boolean };

export async function assertOwnerContinuity(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  targetUserId: string,
): Promise<void> {
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('plg:last-owner:' || ${organizationId}::text))`;
  const rows = await transaction.$queryRaw<OwnerCounts[]>`
    SELECT
      COUNT(DISTINCT ura.user_id)::int AS "activeOwners",
      COALESCE(BOOL_OR(ura.user_id = ${targetUserId}::uuid), false) AS "targetIsActiveOwner"
    FROM user_role_assignments ura
    JOIN roles r
      ON r.id = ura.role_id
     AND r.organization_id = ura.organization_id
    JOIN users u
      ON u.id = ura.user_id
     AND u.organization_id = ura.organization_id
    WHERE ura.organization_id = ${organizationId}::uuid
      AND r.code = 'OWNER'
      AND u.status = 'ACTIVE'
      AND ura.starts_at <= now()
      AND (ura.ends_at IS NULL OR ura.ends_at > now())
  `;
  const state = rows[0];
  if (state?.targetIsActiveOwner && state.activeOwners <= 1) {
    throw new ConflictException({
      code: 'LAST_ACTIVE_OWNER_REQUIRED',
      messageKey: 'users.lastActiveOwnerRequired',
    });
  }
}
