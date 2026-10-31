import { randomUUID } from 'node:crypto';
import { afterAll, it } from 'vitest';
import { createTestHarness } from './postgres/harness';
const { prisma, inRollbackTransaction, expectDatabaseRejection, databaseDescribe } =
  createTestHarness();
databaseDescribe('PostgreSQL contract - Enrollment', () => {
  afterAll(async () => prisma.$disconnect());
  it('enforces enrollment ownership, state transitions, assignment history, and retake links', async () => {
    await inRollbackTransaction(async (transaction) => {
      const organization = await transaction.organization.create({
        data: { code: `ENROLL-${randomUUID()}`, name: 'Enrollment Test' },
      });
      const branch = await transaction.branch.create({
        data: {
          organizationId: organization.id,
          code: 'MAIN',
          name: 'Main',
        },
      });
      const person = await transaction.person.create({
        data: {
          organizationId: organization.id,
          publicId: `STU-${randomUUID().slice(0, 20)}`,
          name: 'Student',
        },
      });
      await transaction.studentProfile.create({
        data: { organizationId: organization.id, personId: person.id },
      });
      const user = await transaction.user.create({
        data: { organizationId: organization.id, personId: person.id, status: 'ACTIVE' },
      });
      const billing = await transaction.billingAccount.create({
        data: { organizationId: organization.id, kind: 'INDIVIDUAL', personId: person.id },
      });
      const otherPerson = await transaction.person.create({
        data: {
          organizationId: organization.id,
          publicId: `OTHER-${randomUUID().slice(0, 18)}`,
          name: 'Other Student',
        },
      });
      await transaction.studentProfile.create({
        data: { organizationId: organization.id, personId: otherPerson.id },
      });
      const program = await transaction.program.create({
        data: {
          organizationId: organization.id,
          code: 'PROGRAM',
          name: 'Program',
        },
      });
      const version = await transaction.programVersion.create({
        data: {
          organizationId: organization.id,
          programId: program.id,
          version: 1,
        },
      });
      const academicModule = await transaction.academicModule.create({
        data: {
          organizationId: organization.id,
          code: 'MODULE',
          name: 'Module',
        },
      });
      const versionModule = await transaction.programVersionModule.create({
        data: {
          organizationId: organization.id,
          programVersionId: version.id,
          moduleId: academicModule.id,
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
          code: 'COHORT',
        },
      });
      await transaction.cohort.update({
        where: { id: cohort.id },
        data: { status: 'PLANNED' },
      });
      const cohortModule = await transaction.cohortModule.create({
        data: {
          organizationId: organization.id,
          cohortId: cohort.id,
          programVersionModuleId: versionModule.id,
          ordinal: 1,
        },
      });
      await expectDatabaseRejection(transaction, () =>
        transaction.enrollment.create({
          data: {
            organizationId: organization.id,
            studentPersonId: otherPerson.id,
            programVersionId: version.id,
            billingAccountId: billing.id,
            homeBranchId: branch.id,
          },
        }),
      );
      const enrollment = await transaction.enrollment.create({
        data: {
          organizationId: organization.id,
          studentPersonId: person.id,
          programVersionId: version.id,
          billingAccountId: billing.id,
          homeBranchId: branch.id,
        },
      });
      const assignment = await transaction.enrollmentCohortAssignment.create({
        data: {
          organizationId: organization.id,
          enrollmentId: enrollment.id,
          cohortId: cohort.id,
          startsAt: new Date('2026-01-01T00:00:00Z'),
          createdBy: user.id,
        },
      });
      await transaction.enrollment.update({
        where: { id: enrollment.id },
        data: { state: 'ACTIVE' },
      });
      await expectDatabaseRejection(transaction, () =>
        transaction.enrollment.update({
          where: { id: enrollment.id },
          data: { state: 'DRAFT' },
        }),
      );
      await transaction.enrollmentCohortAssignment.update({
        where: { id: assignment.id },
        data: { endsAt: new Date('2026-02-01T00:00:00Z') },
      });
      await expectDatabaseRejection(transaction, () =>
        transaction.enrollmentCohortAssignment.update({
          where: { id: assignment.id },
          data: { endsAt: new Date('2026-03-01T00:00:00Z') },
        }),
      );
      await transaction.moduleRetake.create({
        data: {
          organizationId: organization.id,
          enrollmentId: enrollment.id,
          programVersionModuleId: versionModule.id,
          targetCohortModuleId: cohortModule.id,
          requestedBy: user.id,
        },
      });
      await expectDatabaseRejection(transaction, () =>
        transaction.moduleRetake.create({
          data: {
            organizationId: organization.id,
            enrollmentId: enrollment.id,
            programVersionModuleId: versionModule.id,
            targetCohortModuleId: cohortModule.id,
            requestedBy: user.id,
          },
        }),
      );
    });
  });
});
