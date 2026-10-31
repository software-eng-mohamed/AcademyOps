import { defaultRoleGrants } from '@academyops/contracts';
import { expect } from 'vitest';
import type { HttpTestContext } from './http-test-harness';

export async function academic(context: HttpTestContext) {
  const role = await context.prisma.userRoleAssignment.findFirstOrThrow({
    where: { userId: context.userId },
  });
  await context.prisma.rolePermissionGrant.createMany({
    data: defaultRoleGrants.ACADEMIC.map(([permissionCode, scope]) => ({
      organizationId: context.organizationId,
      roleId: role.roleId,
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
export type CommandResult = { id: string; version: number; state: string; status: string };
export async function body<T = Record<string, unknown>>(
  response: Response,
  status: number,
): Promise<T> {
  const value: unknown = await response.json();
  expect(response.status, JSON.stringify(value)).toBe(status);
  return value as T;
}
