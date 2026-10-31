import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AccessContext, StudentOverview } from '@academyops/contracts';
import { cairoMidnight, cairoParts } from './dashboard-utils';

@Injectable()
export class StudentOverviewFinanceService {
  async read(
    tx: Prisma.TransactionClient,
    access: AccessContext,
    courseNames: Map<string, string | null>,
    now: Date,
  ): Promise<Pick<StudentOverview, 'finance' | 'payments'>> {
    const financeAllowed = access.grants.get('finance.balance.read')?.has('S');
    const paymentsAllowed = access.grants.get('payments.read')?.has('S');
    if (!financeAllowed && !paymentsAllowed) return { finance: null, payments: null };
    const organizationId = access.organizationId;
    const enrollmentIds = [...courseNames.keys()];
    const billing = access.studentPersonId
      ? await tx.billingAccount.findMany({
          where: { organizationId, kind: 'INDIVIDUAL', personId: access.studentPersonId },
          select: { id: true },
        })
      : [];
    // Include own enrollment entries and unassigned entries on own individual accounts.
    // Never include another student's charges on a shared/corporate billing account.
    const scope = {
      organizationId,
      OR: [
        { enrollmentId: { in: enrollmentIds } },
        { enrollmentId: null, billingAccountId: { in: billing.map((b) => b.id) } },
      ],
    };
    const { year, month, day } = cairoParts(now);
    const months = Array.from({ length: 6 }, (_, i) => {
      const date = new Date(Date.UTC(year, month - 6 + i, 1));
      return { month: date.toISOString().slice(0, 7), amount: '0.00' };
    });
    const [entries, payments] = await Promise.all([
      financeAllowed
        ? tx.ledgerEntry.groupBy({ by: ['direction'], where: scope, _sum: { amount: true } })
        : [],
      paymentsAllowed
        ? tx.payment.findMany({
            where: {
              ...scope,
              status: 'POSTED',
              receivedAt: { gte: cairoMidnight(year, month - 5, 1), lte: now },
            },
            select: { amount: true, receivedAt: true },
          })
        : [],
    ]);
    let paymentTotal = new Prisma.Decimal(0);
    for (const payment of payments) {
      const date = cairoParts(payment.receivedAt);
      const key = `${date.year}-${String(date.month).padStart(2, '0')}`;
      const bucket = months.find((m) => m.month === key);
      if (bucket) bucket.amount = new Prisma.Decimal(bucket.amount).add(payment.amount).toFixed(2);
      paymentTotal = paymentTotal.add(payment.amount);
    }
    const paymentResult = paymentsAllowed ? { months, total: paymentTotal.toFixed(2) } : null;
    if (!financeAllowed) return { finance: null, payments: paymentResult };
    // Match the canonical installment reader: latest approved agreement, then its
    // latest approved schedule. Older schedules must not reappear as unpaid fees.
    const agreements = await tx.pricingAgreement.findMany({
      where: { organizationId, enrollmentId: { in: enrollmentIds }, status: 'APPROVED' },
      orderBy: [{ version: 'desc' }, { id: 'desc' }],
      distinct: ['enrollmentId'],
      select: { id: true },
    });
    const schedules = await tx.installmentSchedule.findMany({
      where: {
        organizationId,
        enrollmentId: { in: enrollmentIds },
        pricingAgreementId: { in: agreements.map((a) => a.id) },
        status: 'APPROVED',
      },
      orderBy: [{ version: 'desc' }, { id: 'desc' }],
      distinct: ['enrollmentId'],
      select: { id: true, enrollmentId: true },
    });
    const installments = await tx.installment.findMany({
      where: { organizationId, scheduleId: { in: schedules.map((s) => s.id) } },
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        scheduleId: true,
        ordinal: true,
        dueDate: true,
        amount: true,
        debitEntryId: true,
      },
    });
    const allocations = await tx.ledgerAllocation.groupBy({
      by: ['debitEntryId'],
      where: {
        organizationId,
        debitEntryId: { in: installments.flatMap((i) => (i.debitEntryId ? [i.debitEntryId] : [])) },
      },
      _sum: { amount: true },
    });
    const allocated = new Map(
      allocations.map((a) => [a.debitEntryId, a._sum.amount ?? new Prisma.Decimal(0)]),
    );
    const scheduleCourses = new Map(
      schedules.map((s) => [s.id, courseNames.get(s.enrollmentId) ?? null]),
    );
    const today = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
    let overdue = new Prisma.Decimal(0);
    const unpaid = installments.flatMap((i) => {
      const remaining = Prisma.Decimal.max(
        0,
        i.amount.sub(i.debitEntryId ? (allocated.get(i.debitEntryId) ?? 0) : 0),
      );
      if (remaining.lte(0)) return [];
      const dueDate = i.dueDate.toISOString().slice(0, 10);
      const state =
        dueDate < today
          ? ('OVERDUE' as const)
          : dueDate === today
            ? ('DUE' as const)
            : ('UPCOMING' as const);
      if (state === 'OVERDUE') overdue = overdue.add(remaining);
      return [
        {
          id: i.id,
          ordinal: i.ordinal,
          course: scheduleCourses.get(i.scheduleId) ?? null,
          dueDate,
          amount: i.amount.toFixed(2),
          remaining: remaining.toFixed(2),
          state,
        },
      ];
    });
    const debit =
      entries.find((e) => e.direction === 'DEBIT')?._sum.amount ?? new Prisma.Decimal(0);
    const credit =
      entries.find((e) => e.direction === 'CREDIT')?._sum.amount ?? new Prisma.Decimal(0);
    return {
      finance: {
        currency: 'EGP',
        totalDebits: debit.toFixed(2),
        totalCredits: credit.toFixed(2),
        balance: debit.sub(credit).toFixed(2),
        installments: {
          total: unpaid.length,
          overdueAmount: overdue.toFixed(2),
          items: unpaid.slice(0, 6),
        },
      },
      payments: paymentResult,
    };
  }
}
