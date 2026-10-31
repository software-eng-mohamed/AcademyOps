import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { workspaceOverviewRequirements } from '@academyops/contracts';
import type {
  AccessContext,
  WorkspaceMetricKey,
  WorkspaceOverview,
  WorkspaceOverviewRole,
} from '@academyops/contracts';
import { AcademicService } from '../academic/academic.service';
import { CatalogAccessService } from '../academic/catalog-access.service';
import { EnrollmentQueryService } from '../enrollment/enrollment-query.service';
import { OtpChannelAvailabilityService } from '../messaging/otp-channel-availability.service';
import { PrismaService } from '../platform/database/prisma.service';
import { cairoMidnight, cairoParts } from './dashboard-utils';
import { WorkspacePaymentsService } from './workspace-payments.service';
import { StudentOverviewService } from './student-overview.service';
import { WorkspaceInsightsService } from './workspace-insights.service';

@Injectable()
export class WorkspaceOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly academic: AcademicService,
    private readonly catalog: CatalogAccessService,
    private readonly enrollments: EnrollmentQueryService,
    private readonly payments: WorkspacePaymentsService,
    private readonly otp: OtpChannelAvailabilityService,
    private readonly student: StudentOverviewService,
    private readonly insights: WorkspaceInsightsService,
  ) {}

  async overview(access: AccessContext, role: WorkspaceOverviewRole): Promise<WorkspaceOverview> {
    const requirements = workspaceOverviewRequirements[role];
    if (
      !requirements ||
      !requirements.every(([permission, scopes]) =>
        scopes.some((scope) => access.grants.get(permission)?.has(scope)),
      )
    ) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        messageKey: 'auth.permissionDenied',
      });
    }
    const now = new Date();
    const { year, month, day } = cairoParts(now);
    const today = cairoMidnight(year, month, day);
    const tomorrow = cairoMidnight(year, month, day + 1);
    const weekEnd = cairoMidnight(year, month, day + 7);
    const monthStart = cairoMidnight(year, month, 1);
    const base = { role, generatedAt: now.toISOString(), timezone: 'Africa/Cairo' as const };

    if (role === 'OTP_OPERATOR') {
      const [channel, staff] = await Promise.all([
        this.otp.read(access.organizationId),
        this.insights.read(access, role, now),
      ]);
      return {
        ...base,
        metrics: [],
        staff,
        queue: null,
        channel: {
          state: channel.state,
          enabled: channel.enabled,
          otpAvailable: channel.otpAvailable,
          needsQr: channel.needsQr,
          phoneMasked: channel.phoneMasked,
          lastConnectedAt: channel.lastConnectedAt,
          lastHeartbeatAt: channel.lastHeartbeatAt,
        },
      };
    }
    if (role === 'ACCOUNTS') {
      const [payments, staff] = await Promise.all([
        this.payments.read(access, today, tomorrow, monthStart, now),
        this.insights.read(access, role, now),
      ]);
      return {
        ...base,
        ...payments,
        staff,
        channel: null,
      };
    }

    // Personal views remain personal even if a user has additional grants.
    const scopedAccess = this.personalAccess(access, role);
    let visibleIds = await this.academic.visibleSessionIds(scopedAccess);
    if (role === 'ATTENDANCE' && !access.grants.get('attendance.read')?.has('O')) {
      // Catalog O must not expand a branch-scoped attendance grant.
      const cohorts = await this.prisma.cohort.findMany({
        where: {
          organizationId: access.organizationId,
          owningBranchId: { in: [...access.branchIds] },
        },
        select: { id: true },
      });
      visibleIds = (
        await this.prisma.session.findMany({
          where: {
            organizationId: access.organizationId,
            cohortId: { in: cohorts.map((c) => c.id) },
            ...(visibleIds === undefined ? {} : { id: { in: visibleIds } }),
          },
          select: { id: true },
        })
      ).map((s) => s.id);
    }
    const sessionScope: Prisma.SessionWhereInput = {
      organizationId: access.organizationId,
      ...(visibleIds === undefined ? {} : { id: { in: visibleIds } }),
    };
    const todayWhere: Prisma.SessionWhereInput = {
      ...sessionScope,
      startsAt: { gte: today, lt: tomorrow },
      status: { in: ['SCHEDULED', 'COMPLETED'] },
    };
    const upcoming: Prisma.SessionWhereInput = {
      ...sessionScope,
      startsAt: { gte: now, lt: weekEnd },
      status: 'SCHEDULED',
    };
    const isUpcoming = ['TRAINER', 'STUDENT', 'ACADEMIC'].includes(role);
    const queueWhere = isUpcoming ? upcoming : todayWhere;
    const countSession = (where: Prisma.SessionWhereInput) => this.prisma.session.count({ where });
    const metric = async (key: WorkspaceMetricKey, value: Promise<number>) => ({
      key,
      value: await value,
    });
    const metrics = (): Array<Promise<{ key: WorkspaceMetricKey; value: number }>> => {
      switch (role) {
        case 'ACADEMIC':
          return [
            metric('activeCohorts', this.activeCohorts(scopedAccess)),
            metric('sessionsToday', countSession(todayWhere)),
            metric('sessionsNext7Days', countSession(upcoming)),
          ];
        case 'ATTENDANCE':
          return [
            metric('sessionsToday', countSession(todayWhere)),
            metric(
              'openWindowsToday',
              countSession({ ...todayWhere, attendanceWindowState: 'OPEN' }),
            ),
            metric('completedSessionsToday', countSession({ ...todayWhere, status: 'COMPLETED' })),
          ];
        case 'TRAINER':
          return [
            metric('sessionsToday', countSession(todayWhere)),
            metric('sessionsNext7Days', countSession(upcoming)),
            metric(
              'completedSessionsThisMonth',
              countSession({
                ...sessionScope,
                status: 'COMPLETED',
                startsAt: { gte: monthStart, lte: now },
              }),
            ),
          ];
        case 'STUDENT':
          return [
            metric('activeEnrollments', this.countEnrollments(scopedAccess, 'ACTIVE')),
            metric('sessionsNext7Days', countSession(upcoming)),
            metric('completedEnrollments', this.countEnrollments(scopedAccess, 'COMPLETED')),
          ];
        default:
          return [
            metric('sessionsToday', countSession(todayWhere)),
            metric(
              role === 'RECEPTION' ? 'draftEnrollments' : 'activeEnrollments',
              this.countEnrollments(scopedAccess, role === 'RECEPTION' ? 'DRAFT' : 'ACTIVE'),
            ),
            metric('pendingEnrollments', this.countEnrollments(scopedAccess, 'PENDING_APPROVAL')),
          ];
      }
    };
    const [values, total, sessions, student, staff] = await Promise.all([
      Promise.all(metrics()),
      countSession(queueWhere),
      this.prisma.session.findMany({
        where: queueWhere,
        take: 6,
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        select: { id: true, cohortId: true, roomId: true, startsAt: true, status: true },
      }),
      role === 'STUDENT' ? this.student.read(scopedAccess, sessionScope, now) : null,
      role !== 'STUDENT' ? this.insights.read(scopedAccess, role, now, visibleIds) : null,
    ]);
    const [cohorts, rooms] = await Promise.all([
      this.prisma.cohort.findMany({
        where: {
          organizationId: access.organizationId,
          id: { in: sessions.map((item) => item.cohortId) },
        },
        select: { id: true, code: true, name: true },
      }),
      this.prisma.room.findMany({
        where: {
          organizationId: access.organizationId,
          id: { in: sessions.flatMap((item) => (item.roomId ? [item.roomId] : [])) },
        },
        select: { id: true, name: true },
      }),
    ]);
    const cohortById = new Map(cohorts.map((item) => [item.id, item]));
    const roomById = new Map(rooms.map((item) => [item.id, item]));
    return {
      ...base,
      metrics: values,
      ...(student ? { student } : {}),
      ...(staff ? { staff } : {}),
      channel: null,
      queue: {
        kind: isUpcoming ? 'UPCOMING' : 'TODAY',
        total,
        items: sessions.map((item) => ({
          id: item.id,
          title: cohortById.get(item.cohortId)?.name || cohortById.get(item.cohortId)?.code || null,
          subtitle: item.roomId ? (roomById.get(item.roomId)?.name ?? null) : null,
          at: item.startsAt!.toISOString(),
          status: item.status,
          amount: null,
        })),
      },
    };
  }

  private personalAccess(access: AccessContext, role: WorkspaceOverviewRole): AccessContext {
    if (role !== 'STUDENT' && role !== 'TRAINER') return access;
    const grants = new Map(access.grants);
    grants.set('academic.catalog.read', new Set([role === 'STUDENT' ? 'S' : 'A']));
    if (role === 'STUDENT') grants.set('enrollments.read', new Set(['S']));
    return { ...access, grants };
  }

  private async countEnrollments(access: AccessContext, state: string) {
    const ids = await this.enrollments.visibleEnrollmentIds(
      this.prisma,
      access,
      'enrollments.read',
    );
    return this.prisma.enrollment.count({
      where: {
        organizationId: access.organizationId,
        state,
        ...(ids === undefined ? {} : { id: { in: ids } }),
      },
    });
  }

  private async activeCohorts(access: AccessContext) {
    const ids = await this.catalog.visibleCohortIds(access);
    return this.prisma.cohort.count({
      where: {
        organizationId: access.organizationId,
        status: 'ACTIVE',
        ...(ids === undefined ? {} : { id: { in: ids } }),
      },
    });
  }
}
