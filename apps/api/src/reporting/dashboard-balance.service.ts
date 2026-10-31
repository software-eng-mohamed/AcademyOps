import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../platform/database/prisma.service';

export type DashboardFinancialHealth = {
  agingCurrent: Prisma.Decimal;
  agingDays1To30: Prisma.Decimal;
  agingDays31To60: Prisma.Decimal;
  agingDays61To90: Prisma.Decimal;
  agingDays91Plus: Prisma.Decimal;
  dueNext30Days: Prisma.Decimal;
  outstandingBalance: Prisma.Decimal;
  overdueBalance: Prisma.Decimal;
  overdueEnrollmentCount: number;
};

function zeroFinancialHealth(): DashboardFinancialHealth {
  const zero = new Prisma.Decimal(0);
  return {
    agingCurrent: zero,
    agingDays1To30: zero,
    agingDays31To60: zero,
    agingDays61To90: zero,
    agingDays91Plus: zero,
    dueNext30Days: zero,
    outstandingBalance: zero,
    overdueBalance: zero,
    overdueEnrollmentCount: 0,
  };
}

@Injectable()
export class DashboardBalanceService {
  constructor(private readonly prisma: PrismaService) {}

  async financialHealth(
    organizationId: string,
    branchIds: string[] | null,
    asOfDate: string,
  ): Promise<DashboardFinancialHealth> {
    if (branchIds?.length === 0) return zeroFinancialHealth();
    const asOf = new Date(`${asOfDate}T00:00:00.000Z`);
    const next30Days = new Date(asOf);
    next30Days.setUTCDate(next30Days.getUTCDate() + 30);
    const next30Date = next30Days.toISOString().slice(0, 10);
    const branchFilter = branchIds
      ? Prisma.sql`AND enrollment.home_branch_id = ANY(${branchIds}::uuid[])`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<DashboardFinancialHealth[]>(Prisma.sql`
      WITH receivables AS (
        SELECT
          schedule.enrollment_id AS "enrollmentId",
          installment.due_date AS "dueDate",
          GREATEST(installment.amount - COALESCE(allocation.amount, 0), 0) AS outstanding
        FROM installments AS installment
        INNER JOIN installment_schedules AS schedule
          ON schedule.organization_id = installment.organization_id
          AND schedule.id = installment.schedule_id
          AND schedule.status = 'APPROVED'
        INNER JOIN enrollments AS enrollment
          ON enrollment.organization_id = schedule.organization_id
          AND enrollment.id = schedule.enrollment_id
        LEFT JOIN (
          SELECT organization_id, debit_entry_id, SUM(amount) AS amount
          FROM ledger_allocations
          WHERE organization_id = ${organizationId}::uuid
          GROUP BY organization_id, debit_entry_id
        ) AS allocation
          ON allocation.organization_id = installment.organization_id
          AND allocation.debit_entry_id = installment.debit_entry_id
        WHERE installment.organization_id = ${organizationId}::uuid
          AND installment.debit_entry_id IS NOT NULL
          ${branchFilter}
      )
      SELECT
        COALESCE(SUM(outstanding), 0) AS "outstandingBalance",
        COALESCE(
          SUM(outstanding) FILTER (WHERE "dueDate" < CAST(${asOfDate} AS date)),
          0
        ) AS "overdueBalance",
        COUNT(DISTINCT "enrollmentId") FILTER (
          WHERE "dueDate" < CAST(${asOfDate} AS date) AND outstanding > 0
        )::int AS "overdueEnrollmentCount",
        COALESCE(
          SUM(outstanding) FILTER (
            WHERE "dueDate" >= CAST(${asOfDate} AS date)
              AND "dueDate" < CAST(${next30Date} AS date)
          ),
          0
        ) AS "dueNext30Days",
        COALESCE(
          SUM(outstanding) FILTER (WHERE "dueDate" >= CAST(${asOfDate} AS date)),
          0
        ) AS "agingCurrent",
        COALESCE(
          SUM(outstanding) FILTER (
            WHERE "dueDate" < CAST(${asOfDate} AS date)
              AND "dueDate" >= CAST(${asOfDate} AS date) - INTERVAL '30 days'
          ),
          0
        ) AS "agingDays1To30",
        COALESCE(
          SUM(outstanding) FILTER (
            WHERE "dueDate" < CAST(${asOfDate} AS date) - INTERVAL '30 days'
              AND "dueDate" >= CAST(${asOfDate} AS date) - INTERVAL '60 days'
          ),
          0
        ) AS "agingDays31To60",
        COALESCE(
          SUM(outstanding) FILTER (
            WHERE "dueDate" < CAST(${asOfDate} AS date) - INTERVAL '60 days'
              AND "dueDate" >= CAST(${asOfDate} AS date) - INTERVAL '90 days'
          ),
          0
        ) AS "agingDays61To90",
        COALESCE(
          SUM(outstanding) FILTER (
            WHERE "dueDate" < CAST(${asOfDate} AS date) - INTERVAL '90 days'
          ),
          0
        ) AS "agingDays91Plus"
      FROM receivables
      WHERE outstanding > 0
    `);
    return rows[0] ?? zeroFinancialHealth();
  }
}
