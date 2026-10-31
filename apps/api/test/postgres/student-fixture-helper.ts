import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';

export async function setupStudentAPricingAndLedger(
  transaction: Prisma.TransactionClient,
  orgAId: string,
  enrollmentAId: string,
  studentAUserId: string,
  billingAId: string,
) {
  const agreement = await transaction.pricingAgreement.create({
    data: {
      organizationId: orgAId,
      enrollmentId: enrollmentAId,
      version: 1,
      status: 'DRAFT',
      subtotal: '200.00',
      totalAmount: '200.00',
      proposedBy: studentAUserId,
    },
  });

  await transaction.pricingAgreementLine.create({
    data: {
      organizationId: orgAId,
      pricingAgreementId: agreement.id,
      type: 'TUITION',
      descriptionAr: 'Tuition',
      descriptionEn: 'Tuition',
      quantity: '1.00',
      unitAmount: '200.00',
      lineAmount: '200.00',
    },
  });

  await transaction.pricingAgreement.update({
    where: { id: agreement.id },
    data: { status: 'PROPOSED', lockVersion: { increment: 1 } },
  });

  await transaction.pricingAgreement.update({
    where: { id: agreement.id },
    data: {
      status: 'APPROVED',
      approvedBy: studentAUserId,
      approvedAt: new Date(),
      lockVersion: { increment: 1 },
    },
  });

  const schedule = await transaction.installmentSchedule.create({
    data: {
      organizationId: orgAId,
      enrollmentId: enrollmentAId,
      pricingAgreementId: agreement.id,
      version: 1,
      status: 'DRAFT',
    },
  });

  const inst1 = await transaction.installment.create({
    data: {
      organizationId: orgAId,
      scheduleId: schedule.id,
      ordinal: 1,
      dueDate: new Date('2026-01-01'),
      amount: '100.00',
    },
  });

  const inst2 = await transaction.installment.create({
    data: {
      organizationId: orgAId,
      scheduleId: schedule.id,
      ordinal: 2,
      dueDate: new Date('2026-12-31'),
      amount: '100.00',
    },
  });

  await transaction.installmentSchedule.update({
    where: { id: schedule.id },
    data: {
      status: 'APPROVED',
      approvedBy: studentAUserId,
      approvedAt: new Date(),
      lockVersion: { increment: 1 },
    },
  });

  const debit1 = await transaction.ledgerEntry.create({
    data: {
      organizationId: orgAId,
      billingAccountId: billingAId,
      enrollmentId: enrollmentAId,
      direction: 'DEBIT',
      entryType: 'INSTALLMENT',
      amount: '100.00',
      sourceType: 'INSTALLMENT',
      sourceId: inst1.id,
    },
  });
  await transaction.installment.update({
    where: { id: inst1.id },
    data: { debitEntryId: debit1.id },
  });

  const debit2 = await transaction.ledgerEntry.create({
    data: {
      organizationId: orgAId,
      billingAccountId: billingAId,
      enrollmentId: enrollmentAId,
      direction: 'DEBIT',
      entryType: 'INSTALLMENT',
      amount: '100.00',
      sourceType: 'INSTALLMENT',
      sourceId: inst2.id,
    },
  });
  await transaction.installment.update({
    where: { id: inst2.id },
    data: { debitEntryId: debit2.id },
  });

  const credit1 = await transaction.ledgerEntry.create({
    data: {
      organizationId: orgAId,
      billingAccountId: billingAId,
      enrollmentId: enrollmentAId,
      direction: 'CREDIT',
      entryType: 'PAYMENT',
      amount: '40.00',
      sourceType: 'PAYMENT',
      sourceId: randomUUID(),
    },
  });

  await transaction.ledgerAllocation.create({
    data: {
      organizationId: orgAId,
      creditEntryId: credit1.id,
      debitEntryId: debit1.id,
      amount: '40.00',
      createdBy: studentAUserId,
    },
  });

  return {
    agreement,
    schedule,
    inst1,
    inst2,
    debit1,
    debit2,
    credit1,
  };
}
