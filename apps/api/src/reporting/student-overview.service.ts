import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  calculateAttendanceRatio,
  type AccessContext,
  type AttendanceStatus,
  type StudentOverview,
  type StudentSession,
} from '@academyops/contracts';
import { PrismaService } from '../platform/database/prisma.service';
import { cairoMidnight, cairoParts } from './dashboard-utils';
import { StudentOverviewFinanceService } from './student-overview-finance.service';

@Injectable()
export class StudentOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: StudentOverviewFinanceService,
  ) {}

  async read(
    access: AccessContext,
    sessionScope: Prisma.SessionWhereInput,
    now: Date,
  ): Promise<StudentOverview> {
    const { year, month, day } = cairoParts(now);
    const from = cairoMidnight(year, month, day);
    const to = cairoMidnight(year, month, day + 7);
    return this.prisma.$transaction(
      async (tx) => {
        // Never broaden personal data when the account also holds staff grants.
        const enrollments = await tx.enrollment.findMany({
          where: {
            organizationId: access.organizationId,
            studentPersonId: access.studentPersonId ?? '00000000-0000-0000-0000-000000000000',
          },
          select: { id: true, programVersionId: true, state: true },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        });
        const versions = await tx.programVersion.findMany({
          where: {
            organizationId: access.organizationId,
            id: { in: enrollments.map((e) => e.programVersionId) },
          },
          select: { id: true, programId: true },
        });
        const programs = await tx.program.findMany({
          where: {
            organizationId: access.organizationId,
            id: { in: versions.map((v) => v.programId) },
          },
          select: { id: true, name: true },
        });
        const programNames = new Map(programs.map((p) => [p.id, p.name]));
        const versionNames = new Map(
          versions.map((v) => [v.id, programNames.get(v.programId) ?? null]),
        );
        const courseNames = new Map(
          enrollments.map((e) => [e.id, versionNames.get(e.programVersionId) ?? null]),
        );
        const weekWhere: Prisma.SessionWhereInput = {
          ...sessionScope,
          startsAt: { gte: from, lt: to },
          status: { in: ['SCHEDULED', 'COMPLETED'] },
        };
        const selection = {
          id: true,
          cohortId: true,
          cohortModuleId: true,
          roomId: true,
          startsAt: true,
          endsAt: true,
          deliveryMode: true,
          status: true,
        } as const;
        const [week, total, next, attendance, finances] = await Promise.all([
          tx.session.findMany({
            where: weekWhere,
            select: selection,
            orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
            take: 28,
          }),
          tx.session.count({ where: weekWhere }),
          tx.session.findFirst({
            where: { ...sessionScope, status: 'SCHEDULED', startsAt: { gte: now } },
            select: selection,
            orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
          }),
          access.grants.get('attendance.read')?.has('S')
            ? this.attendance(
                tx,
                access.organizationId,
                enrollments.map((e) => e.id),
              )
            : null,
          this.finance.read(tx, access, courseNames, now),
        ]);
        const sessions = [...week, ...(next ? [next] : [])];
        const [cohorts, rooms, cohortModules] = await Promise.all([
          tx.cohort.findMany({
            where: {
              organizationId: access.organizationId,
              id: { in: sessions.map((s) => s.cohortId) },
            },
            select: { id: true, name: true, code: true },
          }),
          tx.room.findMany({
            where: {
              organizationId: access.organizationId,
              id: { in: sessions.flatMap((s) => (s.roomId ? [s.roomId] : [])) },
            },
            select: { id: true, name: true },
          }),
          tx.cohortModule.findMany({
            where: {
              organizationId: access.organizationId,
              id: { in: sessions.map((s) => s.cohortModuleId) },
            },
            select: { id: true, programVersionModuleId: true },
          }),
        ]);
        const versionModules = await tx.programVersionModule.findMany({
          where: {
            organizationId: access.organizationId,
            id: { in: cohortModules.map((m) => m.programVersionModuleId) },
          },
          select: { id: true, moduleId: true },
        });
        const modules = await tx.academicModule.findMany({
          where: {
            organizationId: access.organizationId,
            id: { in: versionModules.map((m) => m.moduleId) },
          },
          select: { id: true, name: true },
        });
        const moduleNames = new Map(modules.map((m) => [m.id, m.name]));
        const versionModuleNames = new Map(
          versionModules.map((m) => [m.id, moduleNames.get(m.moduleId)]),
        );
        const cohortModuleNames = new Map(
          cohortModules.map((m) => [m.id, versionModuleNames.get(m.programVersionModuleId)]),
        );
        const cohortNames = new Map(cohorts.map((c) => [c.id, c.name || c.code]));
        const roomNames = new Map(rooms.map((r) => [r.id, r.name]));
        const serialize = (s: (typeof week)[number]): StudentSession => ({
          id: s.id,
          title: cohortModuleNames.get(s.cohortModuleId) ?? null,
          cohort: cohortNames.get(s.cohortId) ?? null,
          room: s.roomId ? (roomNames.get(s.roomId) ?? null) : null,
          startsAt: s.startsAt!.toISOString(),
          endsAt: s.endsAt?.toISOString() ?? null,
          deliveryMode: s.deliveryMode,
          status: s.status,
        });
        return {
          nextSession: next ? serialize(next) : null,
          schedule: {
            from: from.toISOString(),
            to: to.toISOString(),
            total,
            items: week.map(serialize),
          },
          courses: {
            total: enrollments.length,
            items: enrollments
              .slice(0, 6)
              .map((e) => ({ id: e.id, name: courseNames.get(e.id) ?? null, state: e.state })),
          },
          attendance,
          ...finances,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async attendance(
    tx: Prisma.TransactionClient,
    organizationId: string,
    enrollmentIds: string[],
  ): Promise<NonNullable<StudentOverview['attendance']>> {
    const records = await tx.attendanceRecord.findMany({
      where: { organizationId, enrollmentId: { in: enrollmentIds } },
      select: { id: true, currentStatus: true },
    });
    const credits = await tx.makeupCredit.findMany({
      where: {
        organizationId,
        missedRecordId: { in: records.map((r) => r.id) },
        makeupRecordId: { in: records.map((r) => r.id) },
      },
      select: { missedRecordId: true, makeupRecordId: true },
    });
    const ratio = calculateAttendanceRatio(
      records.map((r) => ({ recordId: r.id, status: r.currentStatus as AttendanceStatus })),
      credits,
    );
    const count = (status: string) => records.filter((r) => r.currentStatus === status).length;
    return {
      ...ratio,
      present: count('PRESENT'),
      late: count('LATE'),
      absent: count('ABSENT'),
      excused: count('EXCUSED'),
      unmarked: count('UNMARKED'),
    };
  }
}
