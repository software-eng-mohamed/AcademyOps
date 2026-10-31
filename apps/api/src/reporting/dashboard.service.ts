import { Injectable } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { resolveDashboardPeriod } from '../common/time/dashboard-period';
import { PrismaService } from '../platform/database/prisma.service';
import { DashboardActivityService } from './dashboard-activity.service';
import { DashboardApprovalsService } from './dashboard-approvals.service';
import { DashboardAttentionService } from './dashboard-attention.service';
import { DashboardBalanceService } from './dashboard-balance.service';
import { DashboardCommercialService } from './dashboard-commercial.service';
import { DashboardDataService } from './dashboard-data.service';
import { DashboardMetricsService } from './dashboard-metrics.service';
import { DashboardScopeService } from './dashboard-scope.service';
import {
  attendanceBand,
  attendanceScore,
  cairoMidnight,
  cairoParts,
  countValues,
  isCountedAttendance,
  money,
} from './dashboard-utils';
import type { DashboardOverviewDto } from './reporting.dto';
export { attendanceBand, attendanceScore, isCountedAttendance };
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: DashboardScopeService,
    private readonly metricsService: DashboardMetricsService,
    private readonly attentionService: DashboardAttentionService,
    private readonly approvalsService: DashboardApprovalsService,
    private readonly activityService: DashboardActivityService,
    private readonly balanceService: DashboardBalanceService,
    private readonly commercialService: DashboardCommercialService,
    private readonly dataService: DashboardDataService,
  ) {}
  async overview(access: AccessContext, input: DashboardOverviewDto = {}) {
    const requestedBranchId = input.branchId;
    const branchIds = await this.scopeService.visibleBranchIds(access, requestedBranchId);
    const branchFilter = branchIds === null ? {} : { homeBranchId: { in: branchIds } };
    const cohortBranchFilter = branchIds === null ? {} : { owningBranchId: { in: branchIds } };
    const now = new Date();
    const period = resolveDashboardPeriod(input, now);
    const cairo = cairoParts(now);
    const todayStart = cairoMidnight(cairo.year, cairo.month, cairo.day);
    const tomorrowStart = cairoMidnight(cairo.year, cairo.month, cairo.day + 1);
    const monthStart = cairoMidnight(cairo.year, cairo.month, 1);
    const asOfDate = `${cairo.year}-${String(cairo.month).padStart(2, '0')}-${String(
      cairo.day,
    ).padStart(2, '0')}`;
    const defaultHistoryStart = cairoMidnight(cairo.year, cairo.month - 5, 1);
    const paymentLoadStart = period.from < defaultHistoryStart ? period.from : defaultHistoryStart;
    const sessionLoadStart = period.from < todayStart ? period.from : todayStart;
    const sessionLoadEnd = period.toExclusive > tomorrowStart ? period.toExclusive : tomorrowStart;
    const [enrollments, cohorts, branches, financialHealth, salesPipeline, payments, sessions] =
      await Promise.all([
        this.prisma.enrollment.findMany({
          where: { organizationId: access.organizationId, ...branchFilter },
          select: {
            id: true,
            studentPersonId: true,
            homeBranchId: true,
            state: true,
            createdAt: true,
            programVersionId: true,
          },
        }),
        this.prisma.cohort.findMany({
          where: { organizationId: access.organizationId, ...cohortBranchFilter },
          select: {
            id: true,
            code: true,
            name: true,
            status: true,
            programVersionId: true,
            owningBranchId: true,
          },
        }),
        this.prisma.branch.findMany({
          where: {
            organizationId: access.organizationId,
            isActive: true,
            ...(branchIds === null ? {} : { id: { in: branchIds } }),
          },
          orderBy: { code: 'asc' },
          select: { id: true, code: true, name: true },
        }),
        this.balanceService.financialHealth(access.organizationId, branchIds, asOfDate),
        this.commercialService.pipeline(
          access.organizationId,
          branchIds,
          monthStart,
          tomorrowStart,
          now,
        ),
        this.dataService.visiblePayments(
          access.organizationId,
          branchIds,
          paymentLoadStart,
          period.toExclusive > tomorrowStart ? period.toExclusive : tomorrowStart,
        ),
        this.dataService.visibleSessions(
          access.organizationId,
          branchIds,
          sessionLoadStart,
          sessionLoadEnd,
        ),
      ]);
    const enrollmentIds = enrollments.map(({ id }) => id);
    const activeEnrollments = enrollments.filter(({ state }) => state === 'ACTIVE');
    const paymentIds = payments.map(({ id }) => id);
    const sessionIds = sessions.map(({ id }) => id);
    const [visibleRefunds, visibleReversals, attendanceRecords] = await Promise.all([
      this.dataService.visibleRefunds(
        access.organizationId,
        paymentIds,
        paymentLoadStart,
        period.toExclusive > tomorrowStart ? period.toExclusive : tomorrowStart,
      ),
      this.dataService.visibleReversals(
        access.organizationId,
        paymentIds,
        paymentLoadStart,
        period.toExclusive > tomorrowStart ? period.toExclusive : tomorrowStart,
      ),
      this.prisma.attendanceRecord.findMany({
        where: { organizationId: access.organizationId, sessionId: { in: sessionIds } },
        select: { id: true, sessionId: true, enrollmentId: true, currentStatus: true },
      }),
    ]);
    const actualMakeupCredits = await this.dataService.makeupCredits(
      access.organizationId,
      sessionIds,
    );
    const paymentById = new Map(payments.map((payment) => [payment.id, payment]));
    const collectionsFor = (from: Date, to: Date) =>
      this.metricsService.collectionsFor(
        payments,
        visibleRefunds,
        visibleReversals,
        paymentById,
        from,
        to,
      );
    const periodSessionIds = new Set(
      sessions
        .filter(
          ({ startsAt }) => startsAt && startsAt >= period.from && startsAt < period.toExclusive,
        )
        .map(({ id }) => id),
    );
    const { attendanceRate, byEnrollment, attendanceHealth } =
      this.metricsService.computeAttendance(
        attendanceRecords,
        periodSessionIds,
        actualMakeupCredits,
        activeEnrollments,
      );
    const [attention, approvals, todaySessions, recentActivity] = await Promise.all([
      this.attentionService.getAttentionItems(
        access,
        enrollmentIds,
        activeEnrollments,
        byEnrollment,
        todayStart,
      ),
      this.approvalsService.getApprovals(access, enrollmentIds, paymentIds),
      this.activityService.getTodaySessions(
        access.organizationId,
        sessions.filter(
          ({ startsAt }) => startsAt && startsAt >= todayStart && startsAt < tomorrowStart,
        ),
        cohorts,
        attendanceRecords,
      ),
      this.activityService.getRecentActivity(access.organizationId),
    ]);
    return {
      generatedAt: now.toISOString(),
      timezone: 'Africa/Cairo',
      range: {
        from: period.from.toISOString(),
        toExclusive: period.toExclusive.toISOString(),
        fromMonth: period.fromMonth,
        toMonth: period.toMonth,
        timeZone: period.timeZone,
      },
      selectedBranchId: requestedBranchId ?? null,
      branches,
      kpis: {
        activeStudents: new Set(activeEnrollments.map(({ studentPersonId }) => studentPersonId))
          .size,
        netCollectionsThisMonth: money(collectionsFor(monthStart, tomorrowStart)),
        netCollectionsInPeriod: money(collectionsFor(period.from, period.toExclusive)),
        outstandingBalance: money(financialHealth.outstandingBalance),
        attendanceRate: attendanceRate === null ? null : attendanceRate.toFixed(4),
        activeCohorts: cohorts.filter(({ status }) => status === 'ACTIVE').length,
        currencyCode: 'EGP',
      },
      trends: {
        enrollments: this.metricsService.monthPointsForRange(
          period.fromMonth,
          period.toMonth,
          (from, to) =>
            enrollments.filter(({ createdAt }) => createdAt >= from && createdAt < to).length,
        ),
        collections: this.metricsService.monthPointsForRange(
          period.fromMonth,
          period.toMonth,
          (from, to) => Number(collectionsFor(from, to).toFixed(2)),
        ),
        attendanceHealth,
      },
      financeHealth: {
        overdueBalance: money(financialHealth.overdueBalance),
        overdueEnrollmentCount: financialHealth.overdueEnrollmentCount,
        dueNext30Days: money(financialHealth.dueNext30Days),
        aging: {
          current: money(financialHealth.agingCurrent),
          days1To30: money(financialHealth.agingDays1To30),
          days31To60: money(financialHealth.agingDays31To60),
          days61To90: money(financialHealth.agingDays61To90),
          days91Plus: money(financialHealth.agingDays91Plus),
        },
      },
      salesPipeline,
      attention: {
        total: attention.length,
        bySeverity: countValues(attention.map(({ severity }) => severity)),
        items: attention.slice(0, 8),
      },
      todaySessions,
      approvals: approvals.slice(0, 6),
      recentActivity,
      academyHealth: {
        openImportIssues: attention.filter(({ reasonCode }) => reasonCode === 'IMPORT_ISSUE')
          .length,
        failedOperations: attention.filter(({ reasonCode }) =>
          ['OUTBOX_FAILED', 'EXPORT_FAILED'].includes(reasonCode),
        ).length,
        pendingCertificateUploads: attention.filter(
          ({ reasonCode }) => reasonCode === 'CERTIFICATE_UPLOAD_PENDING',
        ).length,
        pendingApprovals: approvals.length,
      },
    };
  }
}
