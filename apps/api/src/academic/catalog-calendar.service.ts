import { Injectable } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { PrismaService } from '../platform/database/prisma.service';
import { CatalogAccessService } from './catalog-access.service';
import type { CalendarQueryDto } from './catalog.dto';
import {
  catalogConflict,
  isStudentOnly,
  listStudentCohortAssignmentWindows,
  studentSessionVisibilityWhere,
} from './catalog-helper';

@Injectable()
export class CatalogCalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessPolicy: CatalogAccessService,
  ) {}

  async readCalendar(access: AccessContext, input: CalendarQueryDto) {
    const from = new Date(input.from);
    const to = new Date(input.to);
    if (to <= from || to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000)
      throw catalogConflict('CALENDAR_RANGE_INVALID', 'academic.calendarRangeInvalid');
    const studentAssignments = isStudentOnly(access)
      ? await listStudentCohortAssignmentWindows(this.prisma, access)
      : undefined;
    const visibleCohortIds = studentAssignments
      ? undefined
      : await this.accessPolicy.visibleCohortIds(access);
    let trainerSessionIds: string[] | undefined;
    if (input.trainerId) {
      trainerSessionIds = (
        await this.prisma.sessionTrainer.findMany({
          where: {
            organizationId: access.organizationId,
            trainerId: input.trainerId,
            bookingStatus: 'CONFIRMED',
          },
          select: { sessionId: true },
        })
      ).map(({ sessionId }) => sessionId);
    }
    const sessions = await this.prisma.session.findMany({
      where: {
        organizationId: access.organizationId,
        startsAt: { gte: from, lt: to },
        ...(studentAssignments
          ? studentSessionVisibilityWhere(studentAssignments)
          : visibleCohortIds
            ? { cohortId: { in: visibleCohortIds } }
            : {}),
        ...(input.cohortId ? { cohortId: input.cohortId } : {}),
        ...(input.roomId ? { roomId: input.roomId } : {}),
        ...(trainerSessionIds ? { id: { in: trainerSessionIds } } : {}),
        ...(isStudentOnly(access) ? { status: { not: 'DRAFT' } } : {}),
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      take: 5_000,
    });
    const cohorts = await this.prisma.cohort.findMany({
      where: {
        organizationId: access.organizationId,
        id: { in: sessions.map(({ cohortId }) => cohortId) },
        ...(input.branchId ? { owningBranchId: input.branchId } : {}),
      },
    });
    const allowedCohortIds = new Set(cohorts.map(({ id }) => id));
    const visibleSessions = sessions.filter(({ cohortId }) => allowedCohortIds.has(cohortId));
    const rooms = await this.prisma.room.findMany({
      where: {
        organizationId: access.organizationId,
        id: { in: visibleSessions.flatMap(({ roomId }) => (roomId ? [roomId] : [])) },
      },
    });
    const trainerAssignments = await this.prisma.sessionTrainer.findMany({
      where: {
        organizationId: access.organizationId,
        sessionId: { in: visibleSessions.map(({ id }) => id) },
        bookingStatus: 'CONFIRMED',
      },
    });
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      items: visibleSessions.map((session) => ({
        ...session,
        cohort: cohorts.find(({ id }) => id === session.cohortId) ?? null,
        room: rooms.find(({ id }) => id === session.roomId) ?? null,
        trainers: trainerAssignments.filter(({ sessionId }) => sessionId === session.id),
      })),
    };
  }
}
