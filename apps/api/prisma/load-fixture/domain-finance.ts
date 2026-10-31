import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { DomainEnrollment } from './domain-academic';

const chunkSize = 500;

async function chunks<T>(items: T[], operation: (chunk: T[]) => Promise<unknown>): Promise<void> {
  for (let index = 0; index < items.length; index += chunkSize) {
    await operation(items.slice(index, index + chunkSize));
  }
}

interface FinancePlan extends DomainEnrollment {
  agreementId: string;
  scheduleId: string;
}

interface InstallmentPlan {
  enrollment: FinancePlan;
  id: string;
  debitEntryId: string;
  ordinal: number;
  dueDate: Date;
}

export async function seedFinanceDomain(
  prisma: PrismaClient,
  organizationId: string,
  actorUserId: string,
  enrollments: DomainEnrollment[],
): Promise<void> {
  const method = await prisma.paymentMethod.findFirst({
    where: { organizationId, isActive: true },
    orderBy: { code: 'asc' },
  });
  if (!method) throw new Error('Synthetic payment method is required.');
  const now = new Date();
  const plans: FinancePlan[] = enrollments.map((enrollment) => ({
    ...enrollment,
    agreementId: randomUUID(),
    scheduleId: randomUUID(),
  }));
  await chunks(plans, (items) =>
    prisma.pricingAgreement.createMany({
      data: items.map((item) => ({
        id: item.agreementId,
        organizationId,
        enrollmentId: item.enrollmentId,
        version: 1,
        status: 'DRAFT',
        currencyCode: 'EGP',
        subtotal: '3000.00',
        discountAmount: '0.00',
        totalAmount: '3000.00',
        proposedBy: actorUserId,
      })),
    }),
  );
  await chunks(plans, (items) =>
    prisma.pricingAgreementLine.createMany({
      data: items.map((item) => ({
        organizationId,
        pricingAgreementId: item.agreementId,
        type: 'TUITION',
        descriptionAr: 'رسوم تدريب صناعية',
        descriptionEn: 'Synthetic training fee',
        quantity: '1.00',
        unitAmount: '3000.00',
        lineAmount: '3000.00',
      })),
    }),
  );
  await chunks(plans, (items) =>
    prisma.pricingAgreement.updateMany({
      where: { organizationId, id: { in: items.map((item) => item.agreementId) } },
      data: { status: 'PROPOSED' },
    }),
  );
  await chunks(plans, (items) =>
    prisma.pricingAgreement.updateMany({
      where: { organizationId, id: { in: items.map((item) => item.agreementId) } },
      data: { status: 'APPROVED', approvedBy: actorUserId, approvedAt: now },
    }),
  );
  await chunks(plans, (items) =>
    prisma.installmentSchedule.createMany({
      data: items.map((item) => ({
        id: item.scheduleId,
        organizationId,
        enrollmentId: item.enrollmentId,
        pricingAgreementId: item.agreementId,
        version: 1,
        status: 'DRAFT',
      })),
    }),
  );
  const installments: InstallmentPlan[] = plans.flatMap((enrollment) =>
    [-30, 0, 30].map((days, index) => ({
      enrollment,
      id: randomUUID(),
      debitEntryId: randomUUID(),
      ordinal: index + 1,
      dueDate: new Date(Date.now() + days * 86_400_000),
    })),
  );
  await chunks(installments, (items) =>
    prisma.ledgerEntry.createMany({
      data: items.map((item) => ({
        id: item.debitEntryId,
        organizationId,
        billingAccountId: item.enrollment.billingAccountId,
        enrollmentId: item.enrollment.enrollmentId,
        direction: 'DEBIT',
        entryType: 'TUITION',
        amount: '1000.00',
        sourceType: 'INSTALLMENT',
        sourceId: item.id,
        description: 'Synthetic installment debit',
        postedAt: now,
      })),
    }),
  );
  await chunks(installments, (items) =>
    prisma.installment.createMany({
      data: items.map((item) => ({
        id: item.id,
        organizationId,
        scheduleId: item.enrollment.scheduleId,
        ordinal: item.ordinal,
        dueDate: item.dueDate,
        amount: '1000.00',
        debitEntryId: item.debitEntryId,
      })),
    }),
  );
  await chunks(plans, (items) =>
    prisma.installmentSchedule.updateMany({
      where: { organizationId, id: { in: items.map((item) => item.scheduleId) } },
      data: { status: 'APPROVED', approvedBy: actorUserId, approvedAt: now },
    }),
  );
  const paidPlans = plans.filter((item) => item.subject.roleIndex % 3 === 0);
  const firstDebitByEnrollment = new Map(
    installments
      .filter((item) => item.ordinal === 1)
      .map((item) => [item.enrollment.enrollmentId, item.debitEntryId]),
  );
  const payments = paidPlans.map((enrollment) => ({
    enrollment,
    id: randomUUID(),
    ledgerEntryId: randomUUID(),
    debitEntryId: firstDebitByEnrollment.get(enrollment.enrollmentId)!,
  }));
  await chunks(payments, (items) =>
    prisma.ledgerEntry.createMany({
      data: items.map((item) => ({
        id: item.ledgerEntryId,
        organizationId,
        billingAccountId: item.enrollment.billingAccountId,
        enrollmentId: item.enrollment.enrollmentId,
        direction: 'CREDIT',
        entryType: 'PAYMENT',
        amount: '1000.00',
        sourceType: 'PAYMENT',
        sourceId: item.id,
        description: 'Synthetic posted payment',
        postedAt: now,
      })),
    }),
  );
  await chunks(payments, (items) =>
    prisma.payment.createMany({
      data: items.map((item) => ({
        id: item.id,
        organizationId,
        billingAccountId: item.enrollment.billingAccountId,
        enrollmentId: item.enrollment.enrollmentId,
        ledgerEntryId: item.ledgerEntryId,
        methodId: method.id,
        status: 'POSTED',
        amount: '1000.00',
        currencyCode: 'EGP',
        externalReference: `LOAD-PAY-${item.enrollment.subject.roleIndex}`,
        idempotencyKey: `load-fixture-payment-${item.enrollment.subject.roleIndex}`,
        receivedAt: now,
        postedAt: now,
        createdBy: actorUserId,
      })),
    }),
  );
  await chunks(payments, (items) =>
    prisma.paymentEvent.createMany({
      data: items.map((item) => ({
        organizationId,
        paymentId: item.id,
        fromStatus: 'PENDING_VERIFICATION',
        toStatus: 'POSTED',
        reason: 'Synthetic load fixture',
        actorUserId,
      })),
    }),
  );
  await chunks(payments, (items) =>
    prisma.ledgerAllocation.createMany({
      data: items.map((item) => ({
        organizationId,
        creditEntryId: item.ledgerEntryId,
        debitEntryId: item.debitEntryId,
        amount: '1000.00',
        createdBy: actorUserId,
      })),
    }),
  );
}
