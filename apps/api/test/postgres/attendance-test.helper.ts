import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { AccessContext, PermissionCode, AccessScope } from '@academyops/contracts';
export async function setupTestContext(transaction: Prisma.TransactionClient) {
  const org = await transaction.organization.create({
    data: { code: `TEST-ORG-${randomUUID()}`, name: 'Test' },
  });
  const branch = await transaction.branch.create({
    data: { organizationId: org.id, code: 'MAIN', name: 'Main' },
  });
  const program = await transaction.program.create({
    data: { organizationId: org.id, code: 'PROG', name: 'Program' },
  });
  const version = await transaction.programVersion.create({
    data: { organizationId: org.id, programId: program.id, version: 1 },
  });
  const mod = await transaction.academicModule.create({
    data: {
      organizationId: org.id,
      code: 'ATTENDANCE-MODULE',
      name: 'Module',
    },
  });
  const pvm = await transaction.programVersionModule.create({
    data: {
      organizationId: org.id,
      programVersionId: version.id,
      moduleId: mod.id,
      ordinal: 1,
    },
  });
  const now = new Date();
  const pastMs = now.getTime() - 14 * 86400000;
  const pastBase: Date = new Date(pastMs);
  const startsAt: Date = new Date(now.getTime() - 3600000);
  const endsAt: Date = new Date(now.getTime() + 3600000);
  await transaction.programVersion.update({
    where: { id: version.id },
    data: { status: 'PUBLISHED', effectiveFrom: pastBase },
  });
  const cohort = await transaction.cohort.create({
    data: {
      organizationId: org.id,
      programVersionId: version.id,
      owningBranchId: branch.id,
      code: 'C01',
      name: 'Cohort 1',
    },
  });
  const cohortModule = await transaction.cohortModule.create({
    data: {
      organizationId: org.id,
      cohortId: cohort.id,
      programVersionModuleId: pvm.id,
      ordinal: 1,
    },
  });
  const p1 = await transaction.person.create({
    data: {
      organizationId: org.id,
      publicId: `ST1-${randomUUID().slice(0, 10)}`,
      name: 'Student 1',
    },
  });
  const p2 = await transaction.person.create({
    data: {
      organizationId: org.id,
      publicId: `ST2-${randomUUID().slice(0, 10)}`,
      name: 'Student 2',
    },
  });
  const pNotInRoster = await transaction.person.create({
    data: {
      organizationId: org.id,
      publicId: `ST3-${randomUUID().slice(0, 10)}`,
      name: 'Not in Roster',
    },
  });
  const uStaff = await transaction.user.create({
    data: { organizationId: org.id, personId: p1.id, status: 'ACTIVE' },
  });
  const bill1 = await transaction.billingAccount.create({
    data: { organizationId: org.id, kind: 'INDIVIDUAL', personId: p1.id },
  });
  const bill2 = await transaction.billingAccount.create({
    data: { organizationId: org.id, kind: 'INDIVIDUAL', personId: p2.id },
  });
  await transaction.studentProfile.create({
    data: { organizationId: org.id, personId: p1.id },
  });
  await transaction.studentProfile.create({
    data: { organizationId: org.id, personId: p2.id },
  });
  const e1 = await transaction.enrollment.create({
    data: {
      organizationId: org.id,
      studentPersonId: p1.id,
      programVersionId: version.id,
      billingAccountId: bill1.id,
      homeBranchId: branch.id,
      state: 'ACTIVE',
      activatedAt: pastBase,
    },
  });
  const e2 = await transaction.enrollment.create({
    data: {
      organizationId: org.id,
      studentPersonId: p2.id,
      programVersionId: version.id,
      billingAccountId: bill2.id,
      homeBranchId: branch.id,
      state: 'ACTIVE',
      activatedAt: pastBase,
    },
  });
  await transaction.enrollmentCohortAssignment.create({
    data: {
      organizationId: org.id,
      enrollmentId: e1.id,
      cohortId: cohort.id,
      startsAt: pastBase,
      createdBy: uStaff.id,
    },
  });
  await transaction.enrollmentCohortAssignment.create({
    data: {
      organizationId: org.id,
      enrollmentId: e2.id,
      cohortId: cohort.id,
      startsAt: pastBase,
      createdBy: uStaff.id,
    },
  });
  const session = await transaction.session.create({
    data: {
      organizationId: org.id,
      cohortModuleId: cohortModule.id,
      cohortId: cohort.id,
      ordinal: 1,
      startsAt,
      endsAt,
      deliveryMode: 'IN_PERSON',
      status: 'SCHEDULED',
      attendanceWindowState: 'OPEN',
      version: 1,
    },
  });
  await transaction.attendancePolicyVersion.create({
    data: {
      organizationId: org.id,
      programVersionId: version.id,
      cohortId: null,
      version: 1,
      minimumRatio: 0.8,
      lockAfterMinutes: 1440,
      effectiveFrom: pastBase,
      createdBy: uStaff.id,
    },
  });
  const staffAccess = {
    organizationId: org.id,
    actorUserId: uStaff.id,
    branchIds: new Set([branch.id]),
    grants: new Map<PermissionCode, Set<AccessScope>>([
      ['attendance.record_manual', new Set(['O', 'B'])],
      ['attendance.qr.open', new Set(['O'])],
      ['attendance.correct', new Set(['O'])],
    ]),
  } as unknown as AccessContext;
  const adminAccess = {
    organizationId: org.id,
    actorUserId: uStaff.id,
    branchIds: new Set([branch.id]),
    grants: new Map<PermissionCode, Set<AccessScope>>([
      ['attendance.correct_after_lock', new Set(['O'])],
      ['attendance.correct', new Set(['O'])],
    ]),
  } as unknown as AccessContext;
  return {
    org,
    branch,
    cohort,
    p1,
    p2,
    pNotInRoster,
    uStaff,
    e1,
    e2,
    session,
    staffAccess,
    adminAccess,
  };
}
