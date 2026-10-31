import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { createMockAdapter } from './student-self-service-adapter';
import { setupStudentAPricingAndLedger } from './student-fixture-helper';
export async function setupStudentSelfServiceFixture(transaction: Prisma.TransactionClient) {
  // 1. Seed Organization, Branch, Program & Modules
  const orgA = await transaction.organization.create({
    data: { code: `OA-${randomUUID().slice(0, 8)}`, name: 'Org A' },
  });
  const orgB = await transaction.organization.create({
    data: { code: `OB-${randomUUID().slice(0, 8)}`, name: 'Org B' },
  });
  const branchA = await transaction.branch.create({
    data: { organizationId: orgA.id, code: 'BA', name: 'Branch A' },
  });
  const programA = await transaction.program.create({
    data: { organizationId: orgA.id, code: 'PA', name: 'Program A' },
  });
  const versionA = await transaction.programVersion.create({
    data: { organizationId: orgA.id, programId: programA.id, version: 1 },
  });
  const moduleA = await transaction.academicModule.create({
    data: { organizationId: orgA.id, code: 'MA', name: 'Module A' },
  });
  const pvmA = await transaction.programVersionModule.create({
    data: {
      organizationId: orgA.id,
      programVersionId: versionA.id,
      moduleId: moduleA.id,
      ordinal: 1,
    },
  });
  await transaction.programVersion.update({
    where: { id: versionA.id },
    data: { status: 'PUBLISHED', effectiveFrom: new Date('2026-01-01') },
  });
  const cohortA = await transaction.cohort.create({
    data: {
      organizationId: orgA.id,
      code: 'CA',
      name: 'Cohort A',
      programVersionId: versionA.id,
      owningBranchId: branchA.id,
    },
  });
  // 2. Create Students and Users
  const personA = await transaction.person.create({
    data: {
      organizationId: orgA.id,
      publicId: `STU-A-${randomUUID().slice(0, 8)}`,
      name: 'Student A',
    },
  });
  const studentAUser = await transaction.user.create({
    data: { organizationId: orgA.id, personId: personA.id, status: 'ACTIVE' },
  });
  await transaction.studentProfile.create({
    data: { organizationId: orgA.id, personId: personA.id },
  });
  const billingA = await transaction.billingAccount.create({
    data: { organizationId: orgA.id, kind: 'INDIVIDUAL', personId: personA.id },
  });
  const enrollmentA = await transaction.enrollment.create({
    data: {
      organizationId: orgA.id,
      studentPersonId: personA.id,
      programVersionId: versionA.id,
      billingAccountId: billingA.id,
      homeBranchId: branchA.id,
    },
  });
  await transaction.enrollmentCohortAssignment.create({
    data: {
      organizationId: orgA.id,
      enrollmentId: enrollmentA.id,
      cohortId: cohortA.id,
      startsAt: new Date('2026-01-01'),
      createdBy: studentAUser.id,
    },
  });
  // Student B (in Org A)
  const personB = await transaction.person.create({
    data: {
      organizationId: orgA.id,
      publicId: `STU-B-${randomUUID().slice(0, 8)}`,
      name: 'Student B',
    },
  });
  const studentBUser = await transaction.user.create({
    data: { organizationId: orgA.id, personId: personB.id, status: 'ACTIVE' },
  });
  await transaction.studentProfile.create({
    data: { organizationId: orgA.id, personId: personB.id },
  });
  const billingB = await transaction.billingAccount.create({
    data: { organizationId: orgA.id, kind: 'INDIVIDUAL', personId: personB.id },
  });
  const enrollmentB = await transaction.enrollment.create({
    data: {
      organizationId: orgA.id,
      studentPersonId: personB.id,
      programVersionId: versionA.id,
      billingAccountId: billingB.id,
      homeBranchId: branchA.id,
    },
  });
  await transaction.enrollmentCohortAssignment.create({
    data: {
      organizationId: orgA.id,
      enrollmentId: enrollmentB.id,
      cohortId: cohortA.id,
      startsAt: new Date('2026-01-01'),
      createdBy: studentBUser.id,
    },
  });
  // Student C (in Org B)
  const personC = await transaction.person.create({
    data: {
      organizationId: orgB.id,
      publicId: `STU-C-${randomUUID().slice(0, 8)}`,
      name: 'Student C',
    },
  });
  const studentCUser = await transaction.user.create({
    data: { organizationId: orgB.id, personId: personC.id, status: 'ACTIVE' },
  });
  // 3. Setup Pricing, Schedule and Installments for Student A (Delegated to helper)
  const { agreement, schedule, inst1, inst2, debit1, debit2, credit1 } =
    await setupStudentAPricingAndLedger(
      transaction,
      orgA.id,
      enrollmentA.id,
      studentAUser.id,
      billingA.id,
    );
  const adapter = createMockAdapter(transaction);
  return {
    orgA,
    orgB,
    branchA,
    programA,
    versionA,
    moduleA,
    pvmA,
    cohortA,
    personA,
    studentAUser,
    billingA,
    enrollmentA,
    personB,
    studentBUser,
    billingB,
    enrollmentB,
    personC,
    studentCUser,
    agreement,
    schedule,
    inst1,
    inst2,
    debit1,
    debit2,
    credit1,
    adapter,
  };
}
