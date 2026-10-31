import { randomUUID } from 'node:crypto';
import { defaultRoleGrants } from '@academyops/contracts';
import { describe, expect } from 'vitest';
import type { HttpTestContext } from './http-test-harness';

export const databaseDescribe =
  process.env.DATABASE_URL && process.env.REDIS_URL ? describe : describe.skip;
export async function accounts(context: HttpTestContext) {
  const assignment = await context.prisma.userRoleAssignment.findFirstOrThrow({
    where: { userId: context.userId },
  });
  await context.prisma.rolePermissionGrant.createMany({
    data: defaultRoleGrants.ACCOUNTS.map(([permissionCode, scope]) => ({
      organizationId: context.organizationId,
      roleId: assignment.roleId,
      permissionCode,
      scope,
    })),
  });
  const staff = await context.prisma.staffProfile.create({
    data: { organizationId: context.organizationId, personId: context.personId },
  });
  await context.prisma.staffBranchAssignment.create({
    data: {
      organizationId: context.organizationId,
      staffProfileId: staff.id,
      branchId: context.branchId,
    },
  });
}
export async function body<T = { id: string; status: string; version: number; code?: string }>(
  response: Response,
  status: number,
): Promise<T> {
  const value: unknown = await response.json();
  expect(response.status, JSON.stringify(value)).toBe(status);
  return value as T;
}
export const headers = (version = 1) => ({
  'if-match': String(version),
  'idempotency-key': randomUUID(),
});
