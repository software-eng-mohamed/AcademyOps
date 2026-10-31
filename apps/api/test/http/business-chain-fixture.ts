import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { HttpTestContext } from './http-test-harness';
export type BusinessFixture = {
  studentPersonId: string;
  foreignStudentPersonId: string;
  secondEnrollmentId: string;
  programVersionId: string;
  cohortId: string;
  cohortModuleId: string;
};
export async function seedBusinessFixture(context: HttpTestContext): Promise<BusinessFixture> {
  const { prisma, organizationId, branchId, userId } = context;
  const program = await prisma.program.create({
    data: {
      organizationId,
      code: `HTTP-${randomUUID().slice(0, 8)}`,
      name: 'HTTP business program',
    },
  });
  const version = await prisma.programVersion.create({
    data: {
      organizationId,
      programId: program.id,
      version: 1,
    },
  });
  const academicModule = await prisma.academicModule.create({
    data: {
      organizationId,
      code: `MOD-${randomUUID().slice(0, 8)}`,
      name: 'HTTP module',
    },
  });
  const programModule = await prisma.programVersionModule.create({
    data: {
      organizationId,
      programVersionId: version.id,
      moduleId: academicModule.id,
      ordinal: 1,
    },
  });
  await prisma.programVersion.update({
    where: { id: version.id },
    data: { status: 'PUBLISHED', effectiveFrom: new Date(Date.now() - 86400000) },
  });
  const cohort = await prisma.cohort.create({
    data: {
      organizationId,
      programVersionId: version.id,
      owningBranchId: branchId,
      code: `COH-${randomUUID().slice(0, 8)}`,
      name: 'HTTP business cohort',
      capacity: 10,
    },
  });
  await prisma.cohort.update({ where: { id: cohort.id }, data: { status: 'PLANNED' } });
  // Business/attendance scenarios exercise an already-started group, not an open intake.
  await prisma.cohort.update({ where: { id: cohort.id }, data: { status: 'ACTIVE' } });
  const cohortModule = await prisma.cohortModule.create({
    data: {
      organizationId,
      cohortId: cohort.id,
      programVersionModuleId: programModule.id,
      ordinal: 1,
    },
  });
  const student = await prisma.person.create({
    data: {
      organizationId,
      publicId: `HTTP-ST-${randomUUID().slice(0, 12)}`,
      name: 'HTTP business student',
    },
  });
  await prisma.studentProfile.create({ data: { organizationId, personId: student.id } });
  const foreignStudentPersonId = await seedForeignStudent(prisma);
  const second = await createActiveRosterStudent(
    prisma,
    organizationId,
    branchId,
    userId,
    version.id,
    cohort.id,
  );
  return {
    studentPersonId: student.id,
    foreignStudentPersonId,
    secondEnrollmentId: second,
    programVersionId: version.id,
    cohortId: cohort.id,
    cohortModuleId: cohortModule.id,
  };
}
async function seedForeignStudent(prisma: Prisma.TransactionClient): Promise<string> {
  const organization = await prisma.organization.create({
    data: {
      code: `HTTP-X-${randomUUID().slice(0, 8)}`,
      name: 'Foreign HTTP organization',
    },
  });
  const person = await prisma.person.create({
    data: {
      organizationId: organization.id,
      publicId: `HTTP-X-${randomUUID().slice(0, 12)}`,
      name: 'Foreign student',
    },
  });
  await prisma.studentProfile.create({
    data: { organizationId: organization.id, personId: person.id },
  });
  return person.id;
}
async function createActiveRosterStudent(
  prisma: Prisma.TransactionClient,
  organizationId: string,
  branchId: string,
  userId: string,
  programVersionId: string,
  cohortId: string,
): Promise<string> {
  const person = await prisma.person.create({
    data: {
      organizationId,
      publicId: `HTTP-ST2-${randomUUID().slice(0, 11)}`,
      name: 'HTTP absent student',
    },
  });
  await prisma.studentProfile.create({ data: { organizationId, personId: person.id } });
  const billing = await prisma.billingAccount.create({
    data: { organizationId, kind: 'INDIVIDUAL', personId: person.id },
  });
  const enrollment = await prisma.enrollment.create({
    data: {
      organizationId,
      studentPersonId: person.id,
      programVersionId,
      billingAccountId: billing.id,
      homeBranchId: branchId,
      state: 'ACTIVE',
      activatedAt: new Date(Date.now() - 86400000),
    },
  });
  await prisma.enrollmentCohortAssignment.create({
    data: {
      organizationId,
      enrollmentId: enrollment.id,
      cohortId,
      startsAt: new Date(Date.now() - 86400000),
      createdBy: userId,
    },
  });
  return enrollment.id;
}
export async function seedApprovedFinance(
  context: HttpTestContext,
  enrollmentId: string,
): Promise<void> {
  const agreement = await context.prisma.pricingAgreement.create({
    data: {
      organizationId: context.organizationId,
      enrollmentId,
      version: 1,
      subtotal: '200.00',
      totalAmount: '200.00',
      proposedBy: context.userId,
    },
  });
  await context.prisma.pricingAgreementLine.create({
    data: {
      organizationId: context.organizationId,
      pricingAgreementId: agreement.id,
      type: 'TUITION',
      descriptionAr: 'رسوم البرنامج',
      descriptionEn: 'Program tuition',
      quantity: '1.00',
      unitAmount: '200.00',
      lineAmount: '200.00',
    },
  });
  await context.prisma.pricingAgreement.update({
    where: { id: agreement.id },
    data: { status: 'PROPOSED', lockVersion: { increment: 1 } },
  });
  await context.prisma.pricingAgreement.update({
    where: { id: agreement.id },
    data: {
      status: 'APPROVED',
      approvedBy: context.userId,
      approvedAt: new Date(),
      lockVersion: { increment: 1 },
    },
  });
  const schedule = await context.prisma.installmentSchedule.create({
    data: {
      organizationId: context.organizationId,
      enrollmentId,
      pricingAgreementId: agreement.id,
      version: 1,
    },
  });
  await context.prisma.installment.create({
    data: {
      organizationId: context.organizationId,
      scheduleId: schedule.id,
      ordinal: 1,
      dueDate: new Date(),
      amount: '200.00',
    },
  });
  await context.prisma.installmentSchedule.update({
    where: { id: schedule.id },
    data: {
      status: 'APPROVED',
      approvedBy: context.userId,
      approvedAt: new Date(),
      lockVersion: { increment: 1 },
    },
  });
}
export async function payOffEnrollment(
  context: HttpTestContext,
  enrollmentId: string,
): Promise<void> {
  const enrollment = await context.prisma.enrollment.findUniqueOrThrow({
    where: { id: enrollmentId },
  });
  const debit = await context.prisma.ledgerEntry.findFirstOrThrow({
    where: { organizationId: context.organizationId, enrollmentId, direction: 'DEBIT' },
  });
  const credit = await context.prisma.ledgerEntry.create({
    data: {
      organizationId: context.organizationId,
      billingAccountId: enrollment.billingAccountId,
      enrollmentId,
      direction: 'CREDIT',
      entryType: 'PAYMENT',
      amount: debit.amount,
      sourceType: 'HTTP_TEST_PAYMENT',
      sourceId: randomUUID(),
    },
  });
  await context.prisma.ledgerAllocation.create({
    data: {
      organizationId: context.organizationId,
      creditEntryId: credit.id,
      debitEntryId: debit.id,
      amount: debit.amount,
      createdBy: context.userId,
    },
  });
}
