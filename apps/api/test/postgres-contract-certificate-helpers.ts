import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
/**
 * Shared fixture builder for certificate contract integration tests.
 * Preserves exact entity creation sequence and relational invariants.
 */
export async function setupCertificateContractFixture(transaction: Prisma.TransactionClient) {
  const organization = await transaction.organization.create({
    data: { code: `CERT-${randomUUID()}`, name: 'Certificates' },
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
      publicId: `CERT-STU-${randomUUID().slice(0, 16)}`,
      name: 'Certificate Student',
    },
  });
  const user = await transaction.user.create({
    data: { organizationId: organization.id, personId: person.id, status: 'ACTIVE' },
  });
  await transaction.studentProfile.create({
    data: { organizationId: organization.id, personId: person.id },
  });
  const billing = await transaction.billingAccount.create({
    data: { organizationId: organization.id, kind: 'INDIVIDUAL', personId: person.id },
  });
  const program = await transaction.program.create({
    data: {
      organizationId: organization.id,
      code: 'CERT-PROGRAM',
      name: 'Program',
    },
  });
  const version = await transaction.programVersion.create({
    data: { organizationId: organization.id, programId: program.id, version: 1 },
  });
  const module = await transaction.academicModule.create({
    data: {
      organizationId: organization.id,
      code: 'CERT-MODULE',
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
      code: 'CERT-COHORT',
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
  const enrollment = await transaction.enrollment.create({
    data: {
      organizationId: organization.id,
      studentPersonId: person.id,
      programVersionId: version.id,
      billingAccountId: billing.id,
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
  await transaction.enrollment.update({
    where: { id: enrollment.id },
    data: { state: 'ACTIVE' },
  });
  await transaction.enrollment.update({
    where: { id: enrollment.id },
    data: { state: 'COMPLETED' },
  });
  return {
    organization,
    branch,
    person,
    user,
    billing,
    program,
    version,
    module,
    versionModule,
    cohort,
    cohortModule,
    enrollment,
  };
}
