import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { FinanceAccessService } from '../finance/finance-access.service';
import { PrismaService } from '../platform/database/prisma.service';
import { FinanceReceivablesDto, ReportRangeDto } from './reporting.dto';
import { ReportingQueryService } from './reporting-query.service';

@Injectable()
export class ReportingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financeAccess: FinanceAccessService,
    private readonly queries: ReportingQueryService,
  ) {}

  async operationsOverview(access: AccessContext, input: ReportRangeDto) {
    const range = this.range(input);
    return this.prisma.$transaction(async (transaction) => {
      const scopes = access.grants.get('reports.operations.read');
      const hasOrganization = scopes?.has('O') ?? false;
      const hasBranches = scopes?.has('B') ?? false;
      const hasAssignments = scopes?.has('A') ?? false;
      if (input.branchId) {
        const branch = await transaction.branch.findFirst({
          where: { id: input.branchId, organizationId: access.organizationId },
          select: { id: true },
        });
        if (!branch) throw this.notFound();
        if (!hasOrganization && hasBranches && !access.branchIds.has(input.branchId)) {
          throw this.notFound();
        }
      }

      const branchIds = hasOrganization
        ? input.branchId
          ? [input.branchId]
          : undefined
        : hasBranches
          ? input.branchId
            ? [input.branchId]
            : [...access.branchIds]
          : [];
      const cohorts = await transaction.cohort.findMany({
        where: {
          organizationId: access.organizationId,
          ...(branchIds === undefined ? {} : { owningBranchId: { in: branchIds } }),
        },
        select: { id: true, status: true },
      });
      let assignedSessionIds: string[] = [];
      if (hasAssignments) {
        const user = await transaction.user.findUnique({
          where: { id: access.actorUserId },
          select: { personId: true },
        });
        const trainer = user
          ? await transaction.trainerProfile.findFirst({
              where: {
                organizationId: access.organizationId,
                personId: user.personId,
                status: 'ACTIVE',
              },
              select: { id: true },
            })
          : null;
        if (trainer) {
          const assignments = await transaction.sessionTrainer.findMany({
            where: {
              organizationId: access.organizationId,
              trainerId: trainer.id,
              bookingStatus: 'CONFIRMED',
            },
            select: { sessionId: true },
          });
          assignedSessionIds = assignments.map(({ sessionId }) => sessionId);
        }
      }
      const sessionVisibility: Prisma.SessionWhereInput[] = [];
      if (hasOrganization || hasBranches) {
        sessionVisibility.push({ cohortId: { in: cohorts.map(({ id }) => id) } });
      }
      if (hasAssignments) sessionVisibility.push({ id: { in: assignedSessionIds } });
      const sessions = sessionVisibility.length
        ? await transaction.session.findMany({
            where: {
              organizationId: access.organizationId,
              OR: sessionVisibility,
              startsAt: { gte: range.from, lt: range.toExclusive },
              ...(input.branchId
                ? {
                    cohortId: {
                      in: cohorts.map(({ id }) => id),
                    },
                  }
                : {}),
            },
            select: { id: true, status: true },
          })
        : [];
      const enrollmentBranchIds = branchIds === undefined ? undefined : branchIds;
      const enrollments =
        hasOrganization || hasBranches
          ? await transaction.enrollment.findMany({
              where: {
                organizationId: access.organizationId,
                ...(enrollmentBranchIds === undefined
                  ? {}
                  : { homeBranchId: { in: enrollmentBranchIds } }),
                createdAt: { gte: range.from, lt: range.toExclusive },
              },
              select: { id: true, state: true },
            })
          : [];
      const leadVisibility: Prisma.LeadWhereInput[] = [];
      if (hasOrganization || hasBranches) {
        leadVisibility.push(branchIds === undefined ? {} : { branchId: { in: branchIds } });
      }
      if (hasAssignments) leadVisibility.push({ assignedUserId: access.actorUserId });
      const leads = leadVisibility.length
        ? await transaction.lead.findMany({
            where: {
              organizationId: access.organizationId,
              OR: leadVisibility,
              createdAt: { gte: range.from, lt: range.toExclusive },
              ...(input.branchId ? { branchId: input.branchId } : {}),
            },
            select: { state: true },
          })
        : [];
      const [attendance, certificates] = await Promise.all([
        transaction.attendanceRecord.findMany({
          where: {
            organizationId: access.organizationId,
            sessionId: { in: sessions.map(({ id }) => id) },
          },
          select: { currentStatus: true },
        }),
        transaction.certificate.findMany({
          where: {
            organizationId: access.organizationId,
            enrollmentId: { in: enrollments.map(({ id }) => id) },
            issuedAt: { gte: range.from, lt: range.toExclusive },
          },
          select: { validityStatus: true, pdfStatus: true },
        }),
      ]);
      return {
        from: range.from.toISOString(),
        to: new Date(range.toExclusive.getTime() - 1).toISOString(),
        branchId: input.branchId ?? null,
        leads: { total: leads.length, byState: this.count(leads.map(({ state }) => state)) },
        enrollments: {
          total: enrollments.length,
          byState: this.count(enrollments.map(({ state }) => state)),
        },
        cohorts: {
          total: cohorts.length,
          byState: this.count(cohorts.map(({ status }) => status)),
        },
        sessions: {
          total: sessions.length,
          byState: this.count(sessions.map(({ status }) => status)),
        },
        attendance: {
          total: attendance.length,
          byStatus: this.count(attendance.map(({ currentStatus }) => currentStatus)),
        },
        certificates: {
          total: certificates.length,
          byValidity: this.count(certificates.map(({ validityStatus }) => validityStatus)),
          byFileStatus: this.count(certificates.map(({ pdfStatus }) => pdfStatus)),
        },
      };
    });
  }

  async financeReceivables(access: AccessContext, input: FinanceReceivablesDto) {
    const enrollmentIds = await this.visibleFinanceEnrollmentIds(access, input.branchId);
    const asOf = input.asOf?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    const asOfExclusive = new Date(new Date(`${asOf}T00:00:00.000Z`).getTime() + 86_400_000);
    const rows = await this.queries.receivableRows(
      access.organizationId,
      enrollmentIds,
      asOfExclusive,
    );
    const totals = rows.reduce(
      (sum, row) => ({
        debits: sum.debits.add(row.debits),
        allocated: sum.allocated.add(row.allocated),
        outstanding: sum.outstanding.add(row.outstanding),
      }),
      {
        debits: new Prisma.Decimal(0),
        allocated: new Prisma.Decimal(0),
        outstanding: new Prisma.Decimal(0),
      },
    );
    return {
      asOf,
      branchId: input.branchId ?? null,
      currencyCode: 'EGP',
      enrollmentCount: rows.length,
      outstandingEnrollmentCount: rows.filter((row) => Number(row.outstanding) > 0).length,
      totals: {
        debits: totals.debits.toFixed(2),
        allocated: totals.allocated.toFixed(2),
        outstanding: totals.outstanding.toFixed(2),
      },
    };
  }

  async visibleFinanceEnrollmentIds(
    access: AccessContext,
    branchId?: string,
  ): Promise<string[] | null> {
    return this.prisma.$transaction(async (transaction) => {
      let visible = await this.financeAccess.visibleEnrollmentIds(
        transaction,
        access,
        'finance.reports.read',
      );
      if (branchId) {
        const scopes = access.grants.get('finance.reports.read');
        if (!scopes?.has('O') && !(scopes?.has('B') && access.branchIds.has(branchId))) {
          throw this.notFound();
        }
        const branch = await transaction.branch.findFirst({
          where: { organizationId: access.organizationId, id: branchId },
          select: { id: true },
        });
        if (!branch) throw this.notFound();
        const inBranch = await transaction.enrollment.findMany({
          where: { organizationId: access.organizationId, homeBranchId: branchId },
          select: { id: true },
        });
        const allowed = new Set(inBranch.map(({ id }) => id));
        visible = visible === undefined ? [...allowed] : visible.filter((id) => allowed.has(id));
      }
      return visible === undefined ? null : visible;
    });
  }

  private range(input: ReportRangeDto): { from: Date; toExclusive: Date } {
    const now = new Date();
    const fromText = input.from?.slice(0, 10);
    const toText = input.to?.slice(0, 10);
    const from = fromText
      ? new Date(`${fromText}T00:00:00.000Z`)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const toStart = toText ? new Date(`${toText}T00:00:00.000Z`) : now;
    const toExclusive = toText ? new Date(toStart.getTime() + 86_400_000) : now;
    if (
      !Number.isFinite(from.getTime()) ||
      !Number.isFinite(toExclusive.getTime()) ||
      toExclusive <= from ||
      toExclusive.getTime() - from.getTime() > 366 * 86_400_000
    ) {
      throw new BadRequestException({
        code: 'REPORT_RANGE_INVALID',
        messageKey: 'reports.rangeInvalid',
      });
    }
    return { from, toExclusive };
  }

  private count(values: string[]): Record<string, number> {
    return values.reduce<Record<string, number>>((counts, value) => {
      counts[value] = (counts[value] ?? 0) + 1;
      return counts;
    }, {});
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'REPORT_NOT_FOUND',
      messageKey: 'reports.notFound',
    });
  }
}
