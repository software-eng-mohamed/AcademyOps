import type { Prisma } from '@prisma/client';

const chunkSize = 5_000;

async function chunks(
  ids: string[],
  operation: (ids: string[]) => Promise<unknown>,
): Promise<void> {
  for (let index = 0; index < ids.length; index += chunkSize) {
    await operation(ids.slice(index, index + chunkSize));
  }
}

export async function cleanDomainData(
  prisma: Prisma.TransactionClient,
  organizationId: string,
  personIds: string[],
): Promise<void> {
  const enrollments = await prisma.enrollment.findMany({
    where: { organizationId, studentPersonId: { in: personIds } },
    select: { id: true, billingAccountId: true },
  });
  const enrollmentIds = enrollments.map((item) => item.id);
  const billingIds = enrollments.map((item) => item.billingAccountId);
  if (!enrollmentIds.length) return;
  const attendance = await prisma.attendanceRecord.findMany({
    where: { organizationId, enrollmentId: { in: enrollmentIds } },
    select: { id: true },
  });
  const attendanceIds = attendance.map((item) => item.id);
  await chunks(attendanceIds, async (ids) => {
    await prisma.makeupCredit.deleteMany({
      where: { organizationId, missedRecordId: { in: ids } },
    });
    await prisma.makeupCredit.deleteMany({
      where: { organizationId, makeupRecordId: { in: ids } },
    });
  });
  await prisma.attendanceEvent.deleteMany({
    where: { organizationId, attendanceRecordId: { in: attendanceIds } },
  });
  await prisma.attendanceRecord.deleteMany({
    where: { organizationId, enrollmentId: { in: enrollmentIds } },
  });
  await prisma.attendanceAnomaly.deleteMany({
    where: { organizationId, studentPersonId: { in: personIds } },
  });

  const payments = await prisma.payment.findMany({
    where: { organizationId, enrollmentId: { in: enrollmentIds } },
    select: { id: true },
  });
  const paymentIds = payments.map((item) => item.id);
  const attempts = await prisma.paymentGatewayAttempt.findMany({
    where: { organizationId, enrollmentId: { in: enrollmentIds } },
    select: { id: true },
  });
  await prisma.paymentGatewayEvent.deleteMany({
    where: { organizationId, attemptId: { in: attempts.map((item) => item.id) } },
  });
  await prisma.paymentGatewayAttempt.deleteMany({
    where: { organizationId, enrollmentId: { in: enrollmentIds } },
  });
  await prisma.refund.deleteMany({ where: { organizationId, paymentId: { in: paymentIds } } });
  await prisma.refundRequest.deleteMany({
    where: { organizationId, paymentId: { in: paymentIds } },
  });
  await prisma.paymentReversalRequest.deleteMany({
    where: { organizationId, paymentId: { in: paymentIds } },
  });
  await prisma.internalReceipt.deleteMany({
    where: { organizationId, paymentId: { in: paymentIds } },
  });
  await prisma.paymentEvent.deleteMany({
    where: { organizationId, paymentId: { in: paymentIds } },
  });
  await prisma.payment.deleteMany({ where: { organizationId, id: { in: paymentIds } } });
  const ledger = await prisma.ledgerEntry.findMany({
    where: { organizationId, enrollmentId: { in: enrollmentIds } },
    select: { id: true },
  });
  const ledgerIds = ledger.map((item) => item.id);
  await chunks(ledgerIds, async (ids) => {
    await prisma.ledgerAllocation.deleteMany({
      where: { organizationId, debitEntryId: { in: ids } },
    });
    await prisma.ledgerAllocation.deleteMany({
      where: { organizationId, creditEntryId: { in: ids } },
    });
  });
  const schedules = await prisma.installmentSchedule.findMany({
    where: { organizationId, enrollmentId: { in: enrollmentIds } },
    select: { id: true, pricingAgreementId: true },
  });
  await prisma.installment.deleteMany({
    where: { organizationId, scheduleId: { in: schedules.map((item) => item.id) } },
  });
  await prisma.ledgerEntry.deleteMany({
    where: { organizationId, enrollmentId: { in: enrollmentIds } },
  });
  await prisma.installmentSchedule.deleteMany({
    where: { organizationId, enrollmentId: { in: enrollmentIds } },
  });
  const agreementIds = schedules.map((item) => item.pricingAgreementId);
  await prisma.pricingAgreementLine.deleteMany({
    where: { organizationId, pricingAgreementId: { in: agreementIds } },
  });
  await prisma.pricingAgreement.deleteMany({
    where: { organizationId, enrollmentId: { in: enrollmentIds } },
  });
  await prisma.moduleRetake.deleteMany({
    where: { organizationId, enrollmentId: { in: enrollmentIds } },
  });
  await prisma.enrollmentCancellationRequest.deleteMany({
    where: { organizationId, enrollmentId: { in: enrollmentIds } },
  });
  await prisma.enrollmentEvent.deleteMany({
    where: { organizationId, enrollmentId: { in: enrollmentIds } },
  });
  await prisma.enrollmentCohortAssignment.deleteMany({
    where: { organizationId, enrollmentId: { in: enrollmentIds } },
  });
  await prisma.enrollment.deleteMany({ where: { organizationId, id: { in: enrollmentIds } } });
  await prisma.billingAccount.deleteMany({ where: { organizationId, id: { in: billingIds } } });
}
