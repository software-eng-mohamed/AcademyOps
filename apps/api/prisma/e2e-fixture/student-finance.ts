import type { BillingAccount, Enrollment, Installment, LedgerEntry } from '@prisma/client';
import type { AcademicFixture, FixtureContext, StudentFixture } from './types';
import { dueDate, seedPaymentMethods } from './finance-support';

async function billingAccount(ctx: FixtureContext): Promise<BillingAccount> {
  const personId = ctx.users.student.personId;
  const existing = await ctx.prisma.billingAccount.findFirst({
    where: { organizationId: ctx.organization.id, personId },
  });
  return (
    existing ??
    ctx.prisma.billingAccount.create({
      data: { organizationId: ctx.organization.id, kind: 'INDIVIDUAL', personId },
    })
  );
}

async function enrollment(
  ctx: FixtureContext,
  academic: AcademicFixture,
  billing: BillingAccount,
): Promise<Enrollment> {
  let value = await ctx.prisma.enrollment.findFirst({
    where: {
      organizationId: ctx.organization.id,
      studentPersonId: ctx.users.student.personId,
      programVersionId: academic.version.id,
    },
  });
  value ??= await ctx.prisma.enrollment.create({
    data: {
      organizationId: ctx.organization.id,
      studentPersonId: ctx.users.student.personId,
      programVersionId: academic.version.id,
      billingAccountId: billing.id,
      homeBranchId: ctx.branch.id,
      state: 'ACTIVE',
      activatedAt: dueDate(-30),
    },
  });
  if (value.state !== 'ACTIVE') {
    value = await ctx.prisma.enrollment.update({
      where: { id: value.id },
      data: { state: 'ACTIVE', activatedAt: dueDate(-30) },
    });
  }
  const assignment = await ctx.prisma.enrollmentCohortAssignment.findFirst({
    where: {
      organizationId: ctx.organization.id,
      enrollmentId: value.id,
      cohortId: academic.cohort.id,
      endsAt: null,
    },
  });
  if (!assignment) {
    await ctx.prisma.enrollmentCohortAssignment.create({
      data: {
        organizationId: ctx.organization.id,
        enrollmentId: value.id,
        cohortId: academic.cohort.id,
        startsAt: dueDate(-30),
        createdBy: ctx.users.owner.id,
      },
    });
  }
  return value;
}

async function debit(
  ctx: FixtureContext,
  billing: BillingAccount,
  enrollmentValue: Enrollment,
  installment: Installment,
): Promise<LedgerEntry> {
  const existing = await ctx.prisma.ledgerEntry.findFirst({
    where: {
      organizationId: ctx.organization.id,
      sourceType: 'Installment',
      sourceId: installment.id,
    },
  });
  if (existing) return existing;
  return ctx.prisma.ledgerEntry.create({
    data: {
      organizationId: ctx.organization.id,
      billingAccountId: billing.id,
      enrollmentId: enrollmentValue.id,
      direction: 'DEBIT',
      entryType: 'INSTALLMENT',
      amount: installment.amount,
      sourceType: 'Installment',
      sourceId: installment.id,
      postedAt: dueDate(-20),
    },
  });
}

async function finance(
  ctx: FixtureContext,
  enrollmentValue: Enrollment,
  billing: BillingAccount,
  method: Awaited<ReturnType<typeof seedPaymentMethods>>,
  index: number,
): Promise<void> {
  let agreement = await ctx.prisma.pricingAgreement.upsert({
    where: {
      organizationId_enrollmentId_version: {
        organizationId: ctx.organization.id,
        enrollmentId: enrollmentValue.id,
        version: 1,
      },
    },
    update: {},
    create: {
      organizationId: ctx.organization.id,
      enrollmentId: enrollmentValue.id,
      version: 1,
      status: 'DRAFT',
      subtotal: 10_000,
      totalAmount: 10_000,
      proposedBy: ctx.users.accounts.id,
    },
  });
  const line = await ctx.prisma.pricingAgreementLine.findFirst({
    where: { organizationId: ctx.organization.id, pricingAgreementId: agreement.id },
  });
  if (!line) {
    await ctx.prisma.pricingAgreementLine.create({
      data: {
        organizationId: ctx.organization.id,
        pricingAgreementId: agreement.id,
        type: 'TUITION',
        descriptionAr: 'رسوم اختبار',
        descriptionEn: 'Synthetic tuition',
        unitAmount: 10_000,
        lineAmount: 10_000,
      },
    });
  }
  if (agreement.status === 'DRAFT') {
    agreement = await ctx.prisma.pricingAgreement.update({
      where: { id: agreement.id },
      data: { status: 'PROPOSED' },
    });
  }
  if (agreement.status === 'PROPOSED') {
    agreement = await ctx.prisma.pricingAgreement.update({
      where: { id: agreement.id },
      data: {
        status: 'APPROVED',
        approvedBy: ctx.users.owner.id,
        approvedAt: dueDate(-25),
      },
    });
  }
  const schedule = await ctx.prisma.installmentSchedule.upsert({
    where: {
      organizationId_pricingAgreementId_version: {
        organizationId: ctx.organization.id,
        pricingAgreementId: agreement.id,
        version: 1,
      },
    },
    update: {},
    create: {
      organizationId: ctx.organization.id,
      enrollmentId: enrollmentValue.id,
      pricingAgreementId: agreement.id,
      version: 1,
      status: 'DRAFT',
    },
  });
  const installments: Installment[] = [];
  for (const ordinal of [1, 2]) {
    const installment = await ctx.prisma.installment.upsert({
      where: {
        organizationId_scheduleId_ordinal: {
          organizationId: ctx.organization.id,
          scheduleId: schedule.id,
          ordinal,
        },
      },
      update: {},
      create: {
        organizationId: ctx.organization.id,
        scheduleId: schedule.id,
        ordinal,
        amount: 5_000,
        dueDate: dueDate(ordinal === 1 ? -10 : 20),
      },
    });
    const entry = await debit(ctx, billing, enrollmentValue, installment);
    if (installment.debitEntryId !== entry.id) {
      await ctx.prisma.installment.update({
        where: { id: installment.id },
        data: { debitEntryId: entry.id },
      });
      installment.debitEntryId = entry.id;
    }
    installments.push(installment);
  }
  if (schedule.status === 'DRAFT') {
    await ctx.prisma.installmentSchedule.update({
      where: { id: schedule.id },
      data: {
        status: 'APPROVED',
        approvedBy: ctx.users.owner.id,
        approvedAt: dueDate(-20),
      },
    });
  }
  const paid = index === 0 ? 10_000 : 2_500;
  const payment = await ctx.prisma.payment.upsert({
    where: {
      organizationId_idempotencyKey: {
        organizationId: ctx.organization.id,
        idempotencyKey: `e2e-fixture-payment-${index + 1}`,
      },
    },
    update: {},
    create: {
      organizationId: ctx.organization.id,
      billingAccountId: billing.id,
      enrollmentId: enrollmentValue.id,
      methodId: method.id,
      status: 'POSTED',
      amount: paid,
      idempotencyKey: `e2e-fixture-payment-${index + 1}`,
      receivedAt: dueDate(-5),
      postedAt: dueDate(-5),
      createdBy: ctx.users.accounts.id,
    },
  });
  let credit = await ctx.prisma.ledgerEntry.findFirst({
    where: { organizationId: ctx.organization.id, sourceType: 'Payment', sourceId: payment.id },
  });
  credit ??= await ctx.prisma.ledgerEntry.create({
    data: {
      organizationId: ctx.organization.id,
      billingAccountId: billing.id,
      enrollmentId: enrollmentValue.id,
      direction: 'CREDIT',
      entryType: 'PAYMENT',
      amount: paid,
      sourceType: 'Payment',
      sourceId: payment.id,
      postedAt: dueDate(-5),
    },
  });
  await ctx.prisma.payment.update({
    where: { id: payment.id },
    data: { ledgerEntryId: credit.id },
  });
  let remaining = paid;
  for (const installment of installments) {
    if (remaining <= 0) break;
    const amount = Math.min(5_000, remaining);
    const allocation = await ctx.prisma.ledgerAllocation.findFirst({
      where: {
        organizationId: ctx.organization.id,
        creditEntryId: credit.id,
        debitEntryId: installment.debitEntryId!,
      },
    });
    if (!allocation) {
      await ctx.prisma.ledgerAllocation.create({
        data: {
          organizationId: ctx.organization.id,
          creditEntryId: credit.id,
          debitEntryId: installment.debitEntryId!,
          amount,
          createdBy: ctx.users.accounts.id,
        },
      });
    }
    remaining -= amount;
  }
}

export async function seedStudentFinance(
  ctx: FixtureContext,
  academics: AcademicFixture[],
): Promise<StudentFixture[]> {
  const method = await seedPaymentMethods(ctx);
  const billing = await billingAccount(ctx);
  const result: StudentFixture[] = [];
  for (const [index, academic] of academics.entries()) {
    const enrollmentValue = await enrollment(ctx, academic, billing);
    await finance(ctx, enrollmentValue, billing, method, index);
    result.push({ enrollment: enrollmentValue, academic });
  }
  return result;
}
