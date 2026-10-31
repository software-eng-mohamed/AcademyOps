import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
/**
 * Shared fixture builder for attendance contract integration tests.
 * Preserves exact entity creation sequence and relational invariants.
 */
export async function setupAttendanceContractFixture(transaction: Prisma.TransactionClient) {
  const organization = await transaction.organization.create({
    data: { code: `ATT-${randomUUID()}`, name: 'Attendance' },
  });
  const branch = await transaction.branch.create({
    data: {
      organizationId: organization.id,
      code: 'MAIN',
      name: 'Main',
    },
  });
  const [student, otherStudent] = await Promise.all([
    transaction.person.create({
      data: {
        organizationId: organization.id,
        publicId: `ATT-STU-${randomUUID().slice(0, 18)}`,
        name: 'Roster Student',
      },
    }),
    transaction.person.create({
      data: {
        organizationId: organization.id,
        publicId: `ATT-OTHER-${randomUUID().slice(0, 16)}`,
        name: 'Other Student',
      },
    }),
  ]);
  const user = await transaction.user.create({
    data: { organizationId: organization.id, personId: student.id, status: 'ACTIVE' },
  });
  await Promise.all([
    transaction.studentProfile.create({
      data: { organizationId: organization.id, personId: student.id },
    }),
    transaction.studentProfile.create({
      data: { organizationId: organization.id, personId: otherStudent.id },
    }),
  ]);
  const [billing, otherBilling] = await Promise.all([
    transaction.billingAccount.create({
      data: { organizationId: organization.id, kind: 'INDIVIDUAL', personId: student.id },
    }),
    transaction.billingAccount.create({
      data: {
        organizationId: organization.id,
        kind: 'INDIVIDUAL',
        personId: otherStudent.id,
      },
    }),
  ]);
  const program = await transaction.program.create({
    data: {
      organizationId: organization.id,
      code: 'ATT-PROGRAM',
      name: 'Program',
    },
  });
  const version = await transaction.programVersion.create({
    data: { organizationId: organization.id, programId: program.id, version: 1 },
  });
  const module = await transaction.academicModule.create({
    data: {
      organizationId: organization.id,
      code: 'ATT-MODULE',
      name: 'Module',
    },
  });
  const versionModule = await transaction.programVersionModule.create({
    data: {
      organizationId: organization.id,
      programVersionId: version.id,
      moduleId: module.id,
      ordinal: 1,
    },
  });
  await transaction.programVersion.update({
    where: { id: version.id },
    data: { status: 'PUBLISHED', effectiveFrom: new Date('2026-01-01') },
  });
  const cohort = await transaction.cohort.create({
    data: {
      organizationId: organization.id,
      programVersionId: version.id,
      owningBranchId: branch.id,
      code: 'ATT-COHORT',
    },
  });
  await transaction.cohort.update({ where: { id: cohort.id }, data: { status: 'PLANNED' } });
  await transaction.cohort.update({ where: { id: cohort.id }, data: { status: 'ACTIVE' } });
  const cohortModule = await transaction.cohortModule.create({
    data: {
      organizationId: organization.id,
      cohortId: cohort.id,
      programVersionModuleId: versionModule.id,
      ordinal: 1,
    },
  });
  const session = await transaction.session.create({
    data: {
      organizationId: organization.id,
      cohortModuleId: cohortModule.id,
      cohortId: cohort.id,
      ordinal: 1,
      startsAt: new Date('2026-08-01T10:00:00Z'),
      endsAt: new Date('2026-08-01T12:00:00Z'),
      deliveryMode: 'IN_PERSON',
      status: 'SCHEDULED',
      attendanceWindowState: 'CLOSED',
    },
  });
  const secondSession = await transaction.session.create({
    data: {
      organizationId: organization.id,
      cohortModuleId: cohortModule.id,
      cohortId: cohort.id,
      ordinal: 2,
      startsAt: new Date('2026-08-02T10:00:00Z'),
      endsAt: new Date('2026-08-02T12:00:00Z'),
      deliveryMode: 'IN_PERSON',
      status: 'SCHEDULED',
      attendanceWindowState: 'CLOSED',
    },
  });
  const enrollment = await transaction.enrollment.create({
    data: {
      organizationId: organization.id,
      studentPersonId: student.id,
      programVersionId: version.id,
      billingAccountId: billing.id,
      homeBranchId: branch.id,
    },
  });
  const otherEnrollment = await transaction.enrollment.create({
    data: {
      organizationId: organization.id,
      studentPersonId: otherStudent.id,
      programVersionId: version.id,
      billingAccountId: otherBilling.id,
      homeBranchId: branch.id,
    },
  });
  await transaction.enrollmentCohortAssignment.create({
    data: {
      organizationId: organization.id,
      enrollmentId: enrollment.id,
      cohortId: cohort.id,
      startsAt: new Date('2026-07-01T00:00:00Z'),
      createdBy: user.id,
    },
  });
  return {
    organization,
    branch,
    student,
    otherStudent,
    user,
    billing,
    otherBilling,
    program,
    version,
    module,
    versionModule,
    cohort,
    cohortModule,
    session,
    secondSession,
    enrollment,
    otherEnrollment,
  };
}
