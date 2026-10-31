import type { PrismaClient } from '@prisma/client';

export interface DomainVerification {
  enrollmentIds: Set<string>;
  attendanceSessionIds: Set<string>;
}

export async function verifyDomainData(
  prisma: PrismaClient,
  organizationId: string,
  personIds: string[],
  expectedStudents: number,
): Promise<DomainVerification> {
  const enrollments = await prisma.enrollment.findMany({
    where: { organizationId, studentPersonId: { in: personIds } },
    select: { id: true, billingAccountId: true },
  });
  if (enrollments.length !== expectedStudents) throw new Error('Load enrollment count is invalid.');
  const enrollmentIds = enrollments.map((item) => item.id);
  const billingIds = enrollments.map((item) => item.billingAccountId);
  const agreements = await prisma.pricingAgreement.findMany({
    where: { organizationId, enrollmentId: { in: enrollmentIds }, status: 'APPROVED' },
    select: { id: true },
  });
  const schedules = await prisma.installmentSchedule.findMany({
    where: { organizationId, enrollmentId: { in: enrollmentIds }, status: 'APPROVED' },
    select: { id: true, enrollmentId: true },
  });
  const ledger = await prisma.ledgerEntry.findMany({
    where: { organizationId, enrollmentId: { in: enrollmentIds } },
    select: {
      id: true,
      direction: true,
      entryType: true,
      amount: true,
      sourceType: true,
      sourceId: true,
      enrollmentId: true,
      billingAccountId: true,
    },
  });
  const payments = await prisma.payment.findMany({
    where: { organizationId, enrollmentId: { in: enrollmentIds }, status: 'POSTED' },
    select: {
      id: true,
      ledgerEntryId: true,
      enrollmentId: true,
      billingAccountId: true,
      amount: true,
    },
  });
  const installmentRows = await prisma.installment.findMany({
    where: { organizationId, scheduleId: { in: schedules.map((item) => item.id) } },
    select: { id: true, scheduleId: true, debitEntryId: true, amount: true },
  });
  const allocationRows = await prisma.ledgerAllocation.findMany({
    where: {
      organizationId,
      creditEntryId: {
        in: payments.flatMap((item) => (item.ledgerEntryId ? [item.ledgerEntryId] : [])),
      },
    },
    select: { creditEntryId: true, debitEntryId: true, amount: true },
  });
  const attendance = await prisma.attendanceRecord.findMany({
    where: { organizationId, enrollmentId: { in: enrollmentIds } },
    select: { id: true, sessionId: true },
  });
  const expectedPayments = Math.floor(expectedStudents / 3);
  const [billing, assignments, lines, paymentEvents, attendanceEvents] = await Promise.all([
    prisma.billingAccount.count({ where: { organizationId, id: { in: billingIds } } }),
    prisma.enrollmentCohortAssignment.count({
      where: { organizationId, enrollmentId: { in: enrollmentIds }, endsAt: null },
    }),
    prisma.pricingAgreementLine.count({
      where: { organizationId, pricingAgreementId: { in: agreements.map((item) => item.id) } },
    }),
    prisma.paymentEvent.count({
      where: { organizationId, paymentId: { in: payments.map((item) => item.id) } },
    }),
    prisma.attendanceEvent.count({
      where: { organizationId, attendanceRecordId: { in: attendance.map((item) => item.id) } },
    }),
  ]);
  const ledgerById = new Map(ledger.map((item) => [item.id, item]));
  const scheduleEnrollment = new Map(schedules.map((item) => [item.id, item.enrollmentId]));
  const enrollmentBilling = new Map(enrollments.map((item) => [item.id, item.billingAccountId]));
  const installmentsValid = installmentRows.every((item) => {
    const entry = item.debitEntryId ? ledgerById.get(item.debitEntryId) : undefined;
    const enrollmentId = scheduleEnrollment.get(item.scheduleId);
    return (
      item.amount.toString() === '1000' &&
      entry?.direction === 'DEBIT' &&
      entry.entryType === 'TUITION' &&
      entry.sourceType === 'INSTALLMENT' &&
      entry.sourceId === item.id &&
      entry.amount.toString() === '1000' &&
      entry.enrollmentId === enrollmentId &&
      entry.billingAccountId === enrollmentBilling.get(enrollmentId)
    );
  });
  const paymentsValid = payments.every((item) => {
    const entry = item.ledgerEntryId ? ledgerById.get(item.ledgerEntryId) : undefined;
    return (
      item.amount.toString() === '1000' &&
      entry?.direction === 'CREDIT' &&
      entry.entryType === 'PAYMENT' &&
      entry.sourceType === 'PAYMENT' &&
      entry.sourceId === item.id &&
      entry.amount.toString() === '1000' &&
      entry.enrollmentId === item.enrollmentId &&
      entry.billingAccountId === item.billingAccountId
    );
  });
  const allocationsValid = allocationRows.every((item) => {
    const credit = ledgerById.get(item.creditEntryId);
    const debit = ledgerById.get(item.debitEntryId);
    return (
      item.amount.toString() === '1000' &&
      credit?.direction === 'CREDIT' &&
      debit?.direction === 'DEBIT' &&
      credit.enrollmentId === debit.enrollmentId &&
      credit.billingAccountId === debit.billingAccountId
    );
  });
  const debitCount = ledger.filter((item) => item.direction === 'DEBIT').length;
  const creditCount = ledger.filter((item) => item.direction === 'CREDIT').length;
  const valid =
    billing === expectedStudents &&
    assignments === expectedStudents &&
    agreements.length === expectedStudents &&
    lines === expectedStudents &&
    schedules.length === expectedStudents &&
    installmentRows.length === expectedStudents * 3 &&
    debitCount === expectedStudents * 3 &&
    payments.length === expectedPayments &&
    creditCount === expectedPayments &&
    allocationRows.length === expectedPayments &&
    paymentEvents === expectedPayments &&
    attendance.length === expectedStudents * 2 &&
    attendanceEvents === expectedStudents * 2 &&
    installmentsValid &&
    paymentsValid &&
    allocationsValid;
  if (!valid) throw new Error('Load domain fixture counts or ledger links are inconsistent.');
  return {
    enrollmentIds: new Set(enrollmentIds),
    attendanceSessionIds: new Set(attendance.map((item) => item.sessionId)),
  };
}
