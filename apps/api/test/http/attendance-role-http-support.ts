import { randomUUID } from 'node:crypto';
import { defaultRoleGrants } from '@academyops/contracts';
import { describe, expect } from 'vitest';
import { z } from 'zod';
import { seedBusinessFixture } from './business-chain-fixture';
import type { HttpTestContext } from './http-test-harness';

export const databaseDescribe =
  process.env.DATABASE_URL && process.env.REDIS_URL ? describe : describe.skip;
export const headers = (version = 1) => ({
  'if-match': String(version),
  'idempotency-key': randomUUID(),
});
export const recordSchema = z.object({ id: z.string(), status: z.string(), version: z.number() });
export async function responseBody(response: Response, status: number): Promise<unknown> {
  const value: unknown = await response.json();
  expect(response.status, JSON.stringify(value)).toBe(status);
  return value;
}
export async function attendanceFixture(
  context: HttpTestContext,
  role: 'ATTENDANCE' | 'TRAINER' | 'STUDENT' = 'ATTENDANCE',
) {
  const { prisma, organizationId, userId, personId, branchId } = context;
  const assignment = await prisma.userRoleAssignment.findFirstOrThrow({ where: { userId } });
  await prisma.rolePermissionGrant.createMany({
    data: defaultRoleGrants[role].map(([permissionCode, scope]) => ({
      organizationId,
      roleId: assignment.roleId,
      permissionCode,
      scope,
    })),
  });
  if (role !== 'STUDENT') {
    const staff = await prisma.staffProfile.create({ data: { organizationId, personId } });
    await prisma.staffBranchAssignment.create({
      data: { organizationId, staffProfileId: staff.id, branchId },
    });
  }
  const fixture = await seedBusinessFixture(context);
  await prisma.personContact.create({
    data: {
      organizationId,
      personId: fixture.studentPersonId,
      type: 'EMAIL',
      rawValue: 'private-attendance-fixture@e2e.invalid',
      normalizedValue: 'private-attendance-fixture@e2e.invalid',
      isPrimary: true,
    },
  });
  const billing = await prisma.billingAccount.create({
    data: { organizationId, kind: 'INDIVIDUAL', personId: fixture.studentPersonId },
  });
  const enrollment = await prisma.enrollment.create({
    data: {
      organizationId,
      studentPersonId: fixture.studentPersonId,
      billingAccountId: billing.id,
      programVersionId: fixture.programVersionId,
      homeBranchId: branchId,
      state: 'ACTIVE',
      activatedAt: new Date(Date.now() - 86400000),
    },
  });
  await prisma.enrollmentCohortAssignment.create({
    data: {
      organizationId,
      enrollmentId: enrollment.id,
      cohortId: fixture.cohortId,
      startsAt: new Date(Date.now() - 86400000),
      createdBy: userId,
    },
  });
  await prisma.attendancePolicyVersion.create({
    data: {
      organizationId,
      programVersionId: fixture.programVersionId,
      version: 1,
      minimumRatio: '0.8000',
      lockAfterMinutes: 1440,
      checkInOpensBeforeMinutes: 30,
      checkInClosesAfterMinutes: 30,
      effectiveFrom: new Date(Date.now() - 86400000),
      createdBy: userId,
    },
  });
  const session = await prisma.session.create({
    data: {
      organizationId,
      cohortModuleId: fixture.cohortModuleId,
      cohortId: fixture.cohortId,
      ordinal: 1,
      startsAt: new Date(Date.now() - 300000),
      endsAt: new Date(Date.now() + 3600000),
      deliveryMode: 'ONLINE',
      status: 'SCHEDULED',
    },
  });
  return { ...fixture, enrollmentId: enrollment.id, sessionId: session.id };
}
