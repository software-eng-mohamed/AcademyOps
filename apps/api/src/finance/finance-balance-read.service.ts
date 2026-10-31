import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { FinanceAccessService } from './finance-access.service';
import type { AgingReportDto } from './finance.dto';
import { PrismaService } from '../platform/database/prisma.service';
import { FinanceReadHelperService } from './finance-read-helper.service';

@Injectable()
export class FinanceBalanceReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financeAccess: FinanceAccessService,
    private readonly helper: FinanceReadHelperService,
  ) {}

  async billingSummary(access: AccessContext, billingAccountId: string) {
    return this.prisma.$transaction(async (transaction) => {
      await this.financeAccess.assertBillingAccount(
        transaction,
        access,
        'finance.balance.read',
        billingAccountId,
      );
      return this.summary(transaction, access.organizationId, billingAccountId, null);
    });
  }

  async enrollmentSummary(access: AccessContext, enrollmentId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const enrollment = await this.financeAccess.assertEnrollment(
        transaction,
        access,
        'finance.balance.read',
        enrollmentId,
      );
      return this.summary(
        transaction,
        access.organizationId,
        enrollment.billingAccountId,
        enrollment.id,
      );
    });
  }

  async aging(access: AccessContext, input: AgingReportDto) {
    return this.prisma.$transaction(async (transaction) => {
      let visibleEnrollmentIds = await this.financeAccess.visibleEnrollmentIds(
        transaction,
        access,
        'finance.reports.read',
      );
      if (input.branchId) {
        const scopes = access.grants.get('finance.reports.read');
        if (!scopes?.has('O') && !(scopes?.has('B') && access.branchIds.has(input.branchId))) {
          throw this.helper.notFound('FINANCE_REPORT_NOT_FOUND', 'finance.reportNotFound');
        }
        const branch = await transaction.enrollment.findMany({
          where: { organizationId: access.organizationId, homeBranchId: input.branchId },
          select: { id: true },
        });
        const branchIds = new Set(branch.map(({ id }) => id));
        visibleEnrollmentIds =
          visibleEnrollmentIds === undefined
            ? [...branchIds]
            : visibleEnrollmentIds.filter((id) => branchIds.has(id));
      }
      const schedules = await transaction.installmentSchedule.findMany({
        where: {
          organizationId: access.organizationId,
          status: 'APPROVED',
          ...(visibleEnrollmentIds === undefined
            ? {}
            : { enrollmentId: { in: visibleEnrollmentIds } }),
        },
        select: { id: true, enrollmentId: true },
      });
      const installments = await transaction.installment.findMany({
        where: {
          organizationId: access.organizationId,
          scheduleId: { in: schedules.map(({ id }) => id) },
          debitEntryId: { not: null },
        },
        orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
      });
      const allocations = await transaction.ledgerAllocation.groupBy({
        by: ['debitEntryId'],
        where: {
          organizationId: access.organizationId,
          debitEntryId: {
            in: installments.flatMap(({ debitEntryId }) => (debitEntryId ? [debitEntryId] : [])),
          },
        },
        _sum: { amount: true },
      });
      const allocated = new Map(
        allocations.map(({ debitEntryId, _sum }) => [
          debitEntryId,
          _sum.amount ?? new Prisma.Decimal(0),
        ]),
      );
      const scheduleEnrollment = new Map(
        schedules.map(({ id, enrollmentId }) => [id, enrollmentId]),
      );
      const asOf = input.asOf ? new Date(input.asOf.slice(0, 10) + 'T00:00:00.000Z') : new Date();
      const rows = installments.flatMap((installment) => {
        const outstanding = installment.amount.sub(
          installment.debitEntryId
            ? (allocated.get(installment.debitEntryId) ?? new Prisma.Decimal(0))
            : 0,
        );
        if (outstanding.lte(0)) return [];
        const ageDays = Math.floor((asOf.getTime() - installment.dueDate.getTime()) / 86_400_000);
        return [
          {
            installmentId: installment.id,
            enrollmentId: scheduleEnrollment.get(installment.scheduleId) ?? null,
            dueDate: installment.dueDate,
            ageDays,
            bucket: this.helper.agingBucket(ageDays),
            outstanding: outstanding.toFixed(2),
          },
        ];
      });
      const totals: Record<string, Prisma.Decimal> = {
        CURRENT: new Prisma.Decimal(0),
        DAYS_1_30: new Prisma.Decimal(0),
        DAYS_31_60: new Prisma.Decimal(0),
        DAYS_61_90: new Prisma.Decimal(0),
        DAYS_91_PLUS: new Prisma.Decimal(0),
      };
      for (const row of rows) totals[row.bucket] = totals[row.bucket]!.add(row.outstanding);
      return {
        asOf: asOf.toISOString().slice(0, 10),
        currencyCode: 'EGP',
        totals: Object.fromEntries(
          Object.entries(totals).map(([bucket, total]) => [bucket, total.toFixed(2)]),
        ),
        rows,
      };
    });
  }

  private async summary(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    billingAccountId: string,
    enrollmentId: string | null,
  ) {
    const entries = await transaction.ledgerEntry.findMany({
      where: {
        organizationId,
        billingAccountId,
        ...(enrollmentId ? { enrollmentId } : {}),
      },
      orderBy: [{ postedAt: 'asc' }, { id: 'asc' }],
    });
    const allocations = await transaction.ledgerAllocation.findMany({
      where: {
        organizationId,
        OR: [
          { debitEntryId: { in: entries.map(({ id }) => id) } },
          { creditEntryId: { in: entries.map(({ id }) => id) } },
        ],
      },
    });
    const allocatedToDebit = new Map<string, Prisma.Decimal>();
    const allocatedFromCredit = new Map<string, Prisma.Decimal>();
    for (const allocation of allocations) {
      allocatedToDebit.set(
        allocation.debitEntryId,
        (allocatedToDebit.get(allocation.debitEntryId) ?? new Prisma.Decimal(0)).add(
          allocation.amount,
        ),
      );
      allocatedFromCredit.set(
        allocation.creditEntryId,
        (allocatedFromCredit.get(allocation.creditEntryId) ?? new Prisma.Decimal(0)).add(
          allocation.amount,
        ),
      );
    }
    let debits = new Prisma.Decimal(0);
    let credits = new Prisma.Decimal(0);
    let outstanding = new Prisma.Decimal(0);
    let unapplied = new Prisma.Decimal(0);
    for (const entry of entries) {
      if (entry.direction === 'DEBIT') {
        debits = debits.add(entry.amount);
        outstanding = outstanding.add(
          Prisma.Decimal.max(
            entry.amount.sub(allocatedToDebit.get(entry.id) ?? new Prisma.Decimal(0)),
            0,
          ),
        );
      } else {
        credits = credits.add(entry.amount);
        unapplied = unapplied.add(
          Prisma.Decimal.max(
            entry.amount.sub(allocatedFromCredit.get(entry.id) ?? new Prisma.Decimal(0)),
            0,
          ),
        );
      }
    }
    return {
      billingAccountId,
      enrollmentId,
      currencyCode: 'EGP',
      totalDebits: debits.toFixed(2),
      totalCredits: credits.toFixed(2),
      balance: debits.sub(credits).toFixed(2),
      outstandingDebits: outstanding.toFixed(2),
      unappliedCredits: unapplied.toFixed(2),
    };
  }
}
