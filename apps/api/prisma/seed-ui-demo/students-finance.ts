import type {
  Branch,
  Cohort,
  Enrollment,
  Organization,
  ProgramVersion,
  User,
} from '@prisma/client';
import type { SeedUiDemoContext, StudentsAndFinanceResult } from './types';
import { monthsAgo } from './utils';
export async function seedStudentsAndFinance(
  ctx: SeedUiDemoContext,
  input: {
    organization: Organization;
    mainBranch: Branch;
    eastBranch: Branch;
    version: ProgramVersion;
    cohorts: Cohort[];
    demoUser: User;
  },
): Promise<StudentsAndFinanceResult> {
  const { prisma } = ctx;
  const { organization, mainBranch, eastBranch, version, cohorts, demoUser } = input;
  const paymentMethod = await prisma.paymentMethod.findFirstOrThrow({
    where: { organizationId: organization.id, code: 'PAYMOB' },
  });
  const enrollments: Enrollment[] = [];
  for (let index = 0; index < 8; index += 1) {
    const person = await prisma.person.upsert({
      where: {
        organizationId_publicId: {
          organizationId: organization.id,
          publicId: `UI-STUDENT-${String(index + 1).padStart(3, '0')}`,
        },
      },
      update: { name: `Demo Student ${index + 1}` },
      create: {
        organizationId: organization.id,
        publicId: `UI-STUDENT-${String(index + 1).padStart(3, '0')}`,
        name: `Demo Student ${index + 1}`,
        createdAt: monthsAgo(5 - (index % 6)),
      },
    });
    await prisma.studentProfile.upsert({
      where: { organizationId_personId: { organizationId: organization.id, personId: person.id } },
      update: {},
      create: { organizationId: organization.id, personId: person.id },
    });
    let billing = await prisma.billingAccount.findFirst({
      where: { organizationId: organization.id, personId: person.id },
    });
    billing ??= await prisma.billingAccount.create({
      data: { organizationId: organization.id, kind: 'INDIVIDUAL', personId: person.id },
    });
    const branch = index < 5 ? mainBranch : eastBranch;
    let enrollment = await prisma.enrollment.findFirst({
      where: {
        organizationId: organization.id,
        studentPersonId: person.id,
        programVersionId: version.id,
      },
    });
    enrollment ??= await prisma.enrollment.create({
      data: {
        organizationId: organization.id,
        studentPersonId: person.id,
        programVersionId: version.id,
        billingAccountId: billing.id,
        homeBranchId: branch.id,
        state: 'DRAFT',
        createdAt: monthsAgo(5 - (index % 6)),
      },
    });
    const cohort = index < 5 ? cohorts[0]! : cohorts[1]!;
    const assignment = await prisma.enrollmentCohortAssignment.findFirst({
      where: { organizationId: organization.id, enrollmentId: enrollment.id, endsAt: null },
    });
    if (!assignment)
      await prisma.enrollmentCohortAssignment.create({
        data: {
          organizationId: organization.id,
          enrollmentId: enrollment.id,
          cohortId: cohort.id,
          startsAt: monthsAgo(2),
          createdBy: demoUser.id,
        },
      });
    if (enrollment.state === 'DRAFT') {
      enrollment = await prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { state: 'ACTIVE', activatedAt: monthsAgo(5 - (index % 6)) },
      });
    }
    let agreement = await prisma.pricingAgreement.findFirst({
      where: { organizationId: organization.id, enrollmentId: enrollment.id, version: 1 },
    });
    if (!agreement) {
      const subtotal = 12000;
      const discount = index % 3 === 0 ? 1000 : 0;
      agreement = await prisma.pricingAgreement.create({
        data: {
          organizationId: organization.id,
          enrollmentId: enrollment.id,
          version: 1,
          status: 'DRAFT',
          subtotal,
          discountAmount: discount,
          totalAmount: subtotal - discount,
          proposedBy: demoUser.id,
        },
      });
      await prisma.pricingAgreementLine.create({
        data: {
          organizationId: organization.id,
          pricingAgreementId: agreement.id,
          type: 'TUITION',
          descriptionAr: 'رسوم البرنامج',
          descriptionEn: 'Program tuition',
          unitAmount: subtotal,
          lineAmount: subtotal,
        },
      });
      agreement = await prisma.pricingAgreement.update({
        where: { id: agreement.id },
        data: { status: 'PROPOSED' },
      });
      if (index !== 7)
        agreement = await prisma.pricingAgreement.update({
          where: { id: agreement.id },
          data: { status: 'APPROVED', approvedBy: demoUser.id, approvedAt: monthsAgo(2) },
        });
    }
    let schedule = await prisma.installmentSchedule.findFirst({
      where: { organizationId: organization.id, pricingAgreementId: agreement.id, version: 1 },
    });
    schedule ??= await prisma.installmentSchedule.create({
      data: {
        organizationId: organization.id,
        enrollmentId: enrollment.id,
        pricingAgreementId: agreement.id,
        version: 1,
        status: 'DRAFT',
      },
    });
    let installment = await prisma.installment.findFirst({
      where: { organizationId: organization.id, scheduleId: schedule.id, ordinal: 1 },
    });
    if (!installment) {
      installment = await prisma.installment.create({
        data: {
          organizationId: organization.id,
          scheduleId: schedule.id,
          ordinal: 1,
          dueDate: index < 2 ? new Date(Date.now() - 10 * 86400000) : monthsAgo(1),
          amount: agreement.totalAmount,
        },
      });
      const debit = await prisma.ledgerEntry.create({
        data: {
          organizationId: organization.id,
          billingAccountId: billing.id,
          enrollmentId: enrollment.id,
          direction: 'DEBIT',
          entryType: 'INSTALLMENT',
          amount: agreement.totalAmount,
          sourceType: 'Installment',
          sourceId: installment.id,
          postedAt: monthsAgo(2),
        },
      });
      await prisma.installment.update({
        where: { id: installment.id },
        data: { debitEntryId: debit.id },
      });
      const paid = index < 5 ? Number(agreement.totalAmount) : 4000;
      const payment = await prisma.payment.create({
        data: {
          organizationId: organization.id,
          billingAccountId: billing.id,
          enrollmentId: enrollment.id,
          methodId: paymentMethod.id,
          status: 'POSTED',
          amount: paid,
          idempotencyKey: `ui-fixture-payment-${index + 1}`,
          receivedAt: monthsAgo(index % 6),
          postedAt: monthsAgo(index % 6),
          createdBy: demoUser.id,
        },
      });
      const credit = await prisma.ledgerEntry.create({
        data: {
          organizationId: organization.id,
          billingAccountId: billing.id,
          enrollmentId: enrollment.id,
          direction: 'CREDIT',
          entryType: 'PAYMENT',
          amount: paid,
          sourceType: 'Payment',
          sourceId: payment.id,
          postedAt: payment.postedAt!,
        },
      });
      await prisma.payment.update({
        where: { id: payment.id },
        data: { ledgerEntryId: credit.id },
      });
      await prisma.ledgerAllocation.create({
        data: {
          organizationId: organization.id,
          creditEntryId: credit.id,
          debitEntryId: debit.id,
          amount: paid,
          createdBy: demoUser.id,
        },
      });
    }
    enrollments.push(enrollment);
  }
  return { enrollments };
}
