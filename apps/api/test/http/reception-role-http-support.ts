import { randomUUID } from 'node:crypto';
import { defaultRoleGrants } from '@academyops/contracts';
import { expect } from 'vitest';
import type { HttpTestContext } from './http-test-harness';

export async function reception(context: HttpTestContext) {
  const assignment = await context.prisma.userRoleAssignment.findFirstOrThrow({
    where: { userId: context.userId },
  });
  await context.prisma.rolePermissionGrant.createMany({
    data: defaultRoleGrants.RECEPTION.map(([permissionCode, scope]) => ({
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
export type Command = {
  id: string;
  version: number;
  lockVersion: number;
  state: string;
  status: string;
  enrollmentId: string;
  personId: string;
  fulfillmentStatus: string;
};
export async function body<T = Command>(response: Response, status: number): Promise<T> {
  const value: unknown = await response.json();
  expect(response.status, JSON.stringify(value)).toBe(status);
  return value as T;
}
export const headers = (version = 1) => ({
  'if-match': String(version),
  'idempotency-key': randomUUID(),
});
