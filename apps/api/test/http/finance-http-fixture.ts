import { randomUUID } from 'node:crypto';
import type { HttpTestContext } from './http-test-harness';
export type FinanceHttpFixture = {
  billingAccountId: string;
  enrollmentId: string;
  cashMethodId: string;
  transferMethodId: string;
  otherUserId: string;
  foreignPaymentId: string;
};
export async function seedFinanceHttpFixture(
  context: HttpTestContext,
): Promise<FinanceHttpFixture> {
  const { prisma, organizationId, branchId } = context;
  const program = await prisma.program.create({
    data: {
      organizationId,
      code: `FIN-${randomUUID().slice(0, 8)}`,
      name: 'Finance HTTP program',
    },
  });
  const version = await prisma.programVersion.create({
    data: { organizationId, programId: program.id, version: 1 },
  });
  const academicModule = await prisma.academicModule.create({
    data: {
      organizationId,
      code: `FIN-MOD-${randomUUID().slice(0, 8)}`,
      name: 'Finance HTTP module',
    },
  });
  await prisma.programVersionModule.create({
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
  const student = await prisma.person.create({
    data: {
      organizationId,
      publicId: `FIN-ST-${randomUUID().slice(0, 12)}`,
      name: 'Finance HTTP Student',
    },
  });
  await prisma.studentProfile.create({ data: { organizationId, personId: student.id } });
  const billing = await prisma.billingAccount.create({
    data: { organizationId, kind: 'INDIVIDUAL', personId: student.id },
  });
  const enrollment = await prisma.enrollment.create({
    data: {
      organizationId,
      studentPersonId: student.id,
      programVersionId: version.id,
      billingAccountId: billing.id,
      homeBranchId: branchId,
      state: 'DRAFT',
    },
  });
  const cash = await prisma.paymentMethod.create({
    data: {
      organizationId,
      code: 'CASH',
      name: 'Cash',
      verificationRequired: false,
    },
  });
  const transfer = await prisma.paymentMethod.create({
    data: {
      organizationId,
      code: 'BANK_TRANSFER',
      name: 'Bank transfer',
      verificationRequired: true,
    },
  });
  const checkerPerson = await prisma.person.create({
    data: {
      organizationId,
      publicId: `FIN-CHK-${randomUUID().slice(0, 10)}`,
      name: 'Finance HTTP checker',
    },
  });
  const checker = await prisma.user.create({
    data: { organizationId, personId: checkerPerson.id, status: 'ACTIVE' },
  });
  await prisma.userNotification.create({
    data: {
      organizationId,
      userId: context.userId,
      eventKey: `finance-http-${randomUUID()}`,
      type: 'PAYMENT_RECORDED',
      subjectType: 'Enrollment',
      subjectId: enrollment.id,
      payload: { enrollmentId: enrollment.id },
    },
  });
  const foreignPaymentId = await seedForeignPayment(context);
  return {
    billingAccountId: billing.id,
    enrollmentId: enrollment.id,
    cashMethodId: cash.id,
    transferMethodId: transfer.id,
    otherUserId: checker.id,
    foreignPaymentId,
  };
}
async function seedForeignPayment(context: HttpTestContext): Promise<string> {
  const { prisma } = context;
  const organization = await prisma.organization.create({
    data: {
      code: `FIN-X-${randomUUID().slice(0, 8)}`.toUpperCase(),
      name: 'Foreign finance organization',
    },
  });
  const person = await prisma.person.create({
    data: {
      organizationId: organization.id,
      publicId: `FIN-X-${randomUUID().slice(0, 12)}`,
      name: 'Foreign finance person',
    },
  });
  const user = await prisma.user.create({
    data: { organizationId: organization.id, personId: person.id, status: 'ACTIVE' },
  });
  const billing = await prisma.billingAccount.create({
    data: { organizationId: organization.id, kind: 'INDIVIDUAL', personId: person.id },
  });
  const method = await prisma.paymentMethod.create({
    data: {
      organizationId: organization.id,
      code: 'CASH',
      name: 'Cash',
      verificationRequired: false,
    },
  });
  const payment = await prisma.payment.create({
    data: {
      organizationId: organization.id,
      billingAccountId: billing.id,
      methodId: method.id,
      status: 'POSTED',
      amount: '10.00',
      idempotencyKey: `foreign-${randomUUID()}`,
      receivedAt: new Date(),
      postedAt: new Date(),
      createdBy: user.id,
    },
  });
  return payment.id;
}
