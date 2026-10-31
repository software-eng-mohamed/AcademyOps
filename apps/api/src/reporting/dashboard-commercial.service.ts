import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../platform/database/prisma.service';

const leadStates = ['NEW', 'OPEN', 'QUALIFIED', 'WON', 'LOST', 'DISQUALIFIED'] as const;
const openLeadStates = new Set<string>(['NEW', 'OPEN', 'QUALIFIED']);

type ConversionCountRow = { count: number };

export type DashboardSalesPipeline = {
  byState: Record<string, number>;
  convertedLeadsThisMonth: number;
  newLeadsThisMonth: number;
  openLeads: number;
  overdueFollowUps: number;
};

function emptyPipeline(): DashboardSalesPipeline {
  return {
    byState: Object.fromEntries(leadStates.map((state) => [state, 0])),
    convertedLeadsThisMonth: 0,
    newLeadsThisMonth: 0,
    openLeads: 0,
    overdueFollowUps: 0,
  };
}

@Injectable()
export class DashboardCommercialService {
  constructor(private readonly prisma: PrismaService) {}

  async pipeline(
    organizationId: string,
    branchIds: string[] | null,
    monthStart: Date,
    monthEnd: Date,
    now: Date,
  ): Promise<DashboardSalesPipeline> {
    if (branchIds?.length === 0) return emptyPipeline();
    const branchWhere = branchIds ? { branchId: { in: branchIds } } : {};
    const branchFilter = branchIds
      ? Prisma.sql`AND lead.branch_id = ANY(${branchIds}::uuid[])`
      : Prisma.empty;
    const [stateCounts, newLeadsThisMonth, overdueFollowUps, conversionRows] = await Promise.all([
      this.prisma.lead.groupBy({
        by: ['state'],
        where: { organizationId, ...branchWhere },
        _count: { _all: true },
      }),
      this.prisma.lead.count({
        where: {
          organizationId,
          ...branchWhere,
          createdAt: { gte: monthStart, lt: monthEnd },
        },
      }),
      this.prisma.lead.count({
        where: {
          organizationId,
          ...branchWhere,
          state: { in: [...openLeadStates] },
          nextActionAt: { lt: now },
        },
      }),
      this.prisma.$queryRaw<ConversionCountRow[]>(Prisma.sql`
        SELECT COUNT(*)::int AS count
        FROM lead_conversions AS conversion
        INNER JOIN leads AS lead
          ON lead.organization_id = conversion.organization_id
          AND lead.id = conversion.lead_id
        WHERE conversion.organization_id = ${organizationId}::uuid
          AND conversion.converted_at >= ${monthStart}
          AND conversion.converted_at < ${monthEnd}
          ${branchFilter}
      `),
    ]);
    const byState = emptyPipeline().byState;
    for (const row of stateCounts) byState[row.state] = row._count._all;
    return {
      byState,
      convertedLeadsThisMonth: conversionRows[0]?.count ?? 0,
      newLeadsThisMonth,
      openLeads: stateCounts
        .filter(({ state }) => openLeadStates.has(state))
        .reduce((total, row) => total + row._count._all, 0),
      overdueFollowUps,
    };
  }
}
