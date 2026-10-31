import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { PrismaService } from '../platform/database/prisma.service';
import type { ListSessionsDto } from './academic.dto';
import {
  listStudentCohortAssignmentWindows,
  studentSessionVisibilityWhere,
} from './catalog-helper';
import { normalizeCohortSourceCode } from './cohort-source-data';
@Injectable()
export class AcademicService {
  constructor(private readonly prisma: PrismaService) {}
  async listSessions(access: AccessContext, input: ListSessionsDto) {
    this.assertListRange(input.from, input.to);
    const visibleSessionIds = await this.visibleSessionIds(access);
    const cohortIds = await this.filteredCohortIds(access.organizationId, input.branchId);
    const sourceAliasCohortIds = input.cohortId
      ? await this.sourceAliasCohortIds(access.organizationId, input.cohortId)
      : undefined;
    const trainerSessionIds = input.trainerId
      ? (
          await this.prisma.sessionTrainer.findMany({
            where: {
              organizationId: access.organizationId,
              trainerId: input.trainerId,
              bookingStatus: 'CONFIRMED',
            },
            select: { sessionId: true },
          })
        ).map(({ sessionId }) => sessionId)
      : undefined;
    const sessions = await this.prisma.session.findMany({
      where: {
        organizationId: access.organizationId,
        AND: [
          ...(visibleSessionIds ? [{ id: { in: visibleSessionIds } }] : []),
          ...(trainerSessionIds ? [{ id: { in: trainerSessionIds } }] : []),
          ...(cohortIds ? [{ cohortId: { in: cohortIds } }] : []),
        ],
        ...(sourceAliasCohortIds ? { cohortId: { in: sourceAliasCohortIds } } : {}),
        ...(input.roomId ? { roomId: input.roomId } : {}),
        ...(input.status ? { status: input.status } : { NOT: { status: 'DRAFT', startsAt: null } }),
        ...((input.from || input.to) && {
          startsAt: {
            ...(input.from ? { gte: new Date(input.from) } : {}),
            ...(input.to ? { lt: new Date(input.to) } : {}),
          },
        }),
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });
    const items = await this.hydrateSessions(sessions.slice(0, input.limit));
    return {
      items,
      nextCursor: sessions.length > input.limit ? (sessions[input.limit - 1]?.id ?? null) : null,
    };
  }
  async readSession(access: AccessContext, sessionId: string) {
    const visibleSessionIds = await this.visibleSessionIds(access);
    const session = await this.prisma.session.findFirst({
      where: {
        organizationId: access.organizationId,
        id: sessionId,
        ...(visibleSessionIds ? { AND: { id: { in: visibleSessionIds } } } : {}),
      },
    });
    if (!session)
      throw new NotFoundException({
        code: 'SESSION_NOT_FOUND',
        messageKey: 'academic.sessionNotFound',
      });
    return (await this.hydrateSessions([session]))[0];
  }
  private assertListRange(from?: string, to?: string): void {
    if (from && to && new Date(to) <= new Date(from)) {
      throw new ConflictException({
        code: 'SESSION_RANGE_INVALID',
        messageKey: 'academic.sessionRangeInvalid',
      });
    }
  }
  private async filteredCohortIds(
    organizationId: string,
    branchId?: string,
  ): Promise<string[] | undefined> {
    if (!branchId) return undefined;
    return (
      await this.prisma.cohort.findMany({
        where: { organizationId, owningBranchId: branchId },
        select: { id: true },
      })
    ).map(({ id }) => id);
  }
  async visibleSessionIds(access: AccessContext): Promise<string[] | undefined> {
    const scopes = access.grants.get('academic.catalog.read');
    if (scopes?.has('O')) return undefined;
    if (scopes?.has('B')) {
      const cohorts = await this.prisma.cohort.findMany({
        where: {
          organizationId: access.organizationId,
          owningBranchId: { in: [...access.branchIds] },
        },
        select: { id: true },
      });
      return (
        await this.prisma.session.findMany({
          where: {
            organizationId: access.organizationId,
            cohortId: { in: cohorts.map(({ id }) => id) },
          },
          select: { id: true },
        })
      ).map(({ id }) => id);
    }
    if (scopes?.has('A')) {
      const user = await this.prisma.user.findFirst({
        where: { organizationId: access.organizationId, id: access.actorUserId },
        select: { personId: true },
      });
      if (!user) return [];
      const trainer = await this.prisma.trainerProfile.findFirst({
        where: {
          organizationId: access.organizationId,
          personId: user.personId,
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      if (!trainer) return [];
      return (
        await this.prisma.sessionTrainer.findMany({
          where: {
            organizationId: access.organizationId,
            trainerId: trainer.id,
            bookingStatus: 'CONFIRMED',
          },
          select: { sessionId: true },
        })
      ).map(({ sessionId }) => sessionId);
    }
    if (scopes?.has('S') && access.studentPersonId) {
      const assignments = await listStudentCohortAssignmentWindows(this.prisma, access);
      return (
        await this.prisma.session.findMany({
          where: {
            organizationId: access.organizationId,
            ...studentSessionVisibilityWhere(assignments),
            status: { not: 'DRAFT' },
          },
          select: { id: true },
        })
      ).map(({ id }) => id);
    }
    return [];
  }
  private async sourceAliasCohortIds(
    organizationId: string,
    requestedCohortId: string,
  ): Promise<string[]> {
    const cohorts = await this.prisma.cohort.findMany({
      where: { organizationId },
      select: { id: true, code: true },
    });
    const requested = cohorts.find(({ id }) => id === requestedCohortId);
    if (!requested) return [requestedCohortId];
    const key = normalizeCohortSourceCode(requested.code);
    return cohorts
      .filter(({ code }) => normalizeCohortSourceCode(code) === key)
      .map(({ id }) => id);
  }
  private async hydrateSessions<
    T extends {
      id: string;
      organizationId: string;
      cohortId: string;
      cohortModuleId: string;
      roomId: string | null;
    },
  >(sessions: T[]) {
    if (!sessions.length) return [];
    const organizationId = sessions[0]!.organizationId;
    const cohorts = await this.prisma.cohort.findMany({
      where: {
        organizationId,
        id: { in: sessions.map(({ cohortId }) => cohortId) },
      },
    });
    const rooms = await this.prisma.room.findMany({
      where: {
        organizationId,
        id: { in: sessions.flatMap(({ roomId }) => (roomId ? [roomId] : [])) },
      },
    });
    const trainerAssignments = await this.prisma.sessionTrainer.findMany({
      where: {
        organizationId,
        sessionId: { in: sessions.map(({ id }) => id) },
        bookingStatus: 'CONFIRMED',
      },
    });
    const trainers = await this.prisma.trainerProfile.findMany({
      where: {
        organizationId,
        id: { in: trainerAssignments.map(({ trainerId }) => trainerId) },
      },
    });
    const people = await this.prisma.person.findMany({
      where: {
        organizationId,
        id: { in: trainers.map(({ personId }) => personId) },
      },
      select: { id: true, publicId: true, name: true },
    });
    const cohortModules = await this.prisma.cohortModule.findMany({
      where: {
        organizationId,
        id: { in: sessions.map(({ cohortModuleId }) => cohortModuleId) },
      },
    });
    const versionModules = await this.prisma.programVersionModule.findMany({
      where: {
        organizationId,
        id: { in: cohortModules.map(({ programVersionModuleId }) => programVersionModuleId) },
      },
    });
    const modules = await this.prisma.academicModule.findMany({
      where: {
        organizationId,
        id: { in: versionModules.map(({ moduleId }) => moduleId) },
      },
    });
    const coordinatorReferences = await this.prisma.legacyReference.findMany({
      where: {
        organizationId,
        entityType: 'SESSION',
        entityId: { in: sessions.map(({ id }) => id) },
        sourceField: 'SESSION_COORDINATOR',
      },
      orderBy: { createdAt: 'desc' },
    });
    return sessions.map((session) => ({
      ...session,
      cohort: cohorts.find(({ id }) => id === session.cohortId) ?? null,
      room: rooms.find(({ id }) => id === session.roomId) ?? null,
      trainers: trainerAssignments
        .filter(({ sessionId }) => sessionId === session.id)
        .map((assignment) => ({
          ...assignment,
          trainer: (() => {
            const trainer = trainers.find(({ id }) => id === assignment.trainerId);
            if (!trainer) return null;
            return {
              ...trainer,
              person: people.find(({ id }) => id === trainer.personId) ?? null,
            };
          })(),
        })),
      module: (() => {
        const cohortModule = cohortModules.find(({ id }) => id === session.cohortModuleId);
        const versionModule = versionModules.find(
          ({ id }) => id === cohortModule?.programVersionModuleId,
        );
        return modules.find(({ id }) => id === versionModule?.moduleId) ?? null;
      })(),
      coordinatorName:
        coordinatorReferences.find(({ entityId }) => entityId === session.id)?.rawValue ?? null,
    }));
  }
}
