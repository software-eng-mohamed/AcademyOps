import { Injectable } from '@nestjs/common';
import { PrismaService } from '../platform/database/prisma.service';
@Injectable()
export class DashboardActivityService {
  constructor(private readonly prisma: PrismaService) {}
  async getTodaySessions(
    organizationId: string,
    sessions: Array<{
      id: string;
      cohortId: string;
      roomId: string | null;
      startsAt: Date | null;
      endsAt: Date | null;
      deliveryMode: string;
      status: string;
      attendanceWindowState: string;
    }>,
    cohorts: Array<{
      id: string;
      code: string;
      name: string | null;
      programVersionId: string;
    }>,
    attendance: Array<{
      sessionId: string;
      currentStatus: string;
    }>,
  ) {
    const programVersionIds = [...new Set(cohorts.map(({ programVersionId }) => programVersionId))];
    const roomIds = sessions.flatMap(({ roomId }) => (roomId ? [roomId] : []));
    const sessionIds = sessions.map(({ id }) => id);
    const [versions, rooms, trainerAssignments] = await Promise.all([
      this.prisma.programVersion.findMany({
        where: { organizationId, id: { in: programVersionIds } },
        select: { id: true, programId: true },
      }),
      this.prisma.room.findMany({
        where: { organizationId, id: { in: roomIds } },
        select: { id: true, name: true },
      }),
      this.prisma.sessionTrainer.findMany({
        where: { organizationId, sessionId: { in: sessionIds }, bookingStatus: 'CONFIRMED' },
        select: { sessionId: true, trainerId: true },
      }),
    ]);
    const programs = await this.prisma.program.findMany({
      where: { organizationId, id: { in: versions.map(({ programId }) => programId) } },
      select: { id: true, name: true },
    });
    const trainers = await this.prisma.trainerProfile.findMany({
      where: { organizationId, id: { in: trainerAssignments.map(({ trainerId }) => trainerId) } },
      select: { id: true, personId: true },
    });
    const trainerPeople = await this.prisma.person.findMany({
      where: { organizationId, id: { in: trainers.map(({ personId }) => personId) } },
      select: { id: true, name: true },
    });
    const cohortById = new Map(cohorts.map((cohort) => [cohort.id, cohort]));
    const versionById = new Map(versions.map((version) => [version.id, version]));
    const programById = new Map(programs.map((program) => [program.id, program]));
    const roomById = new Map(rooms.map((room) => [room.id, room]));
    const trainerById = new Map(trainers.map((trainer) => [trainer.id, trainer]));
    const personById = new Map(trainerPeople.map((person) => [person.id, person]));
    return sessions.map((session) => {
      const cohort = cohortById.get(session.cohortId);
      const version = cohort ? versionById.get(cohort.programVersionId) : undefined;
      const program = version ? programById.get(version.programId) : undefined;
      const room = session.roomId ? roomById.get(session.roomId) : undefined;
      const assignment = trainerAssignments.find(({ sessionId }) => sessionId === session.id);
      const trainer = assignment ? trainerById.get(assignment.trainerId) : undefined;
      const trainerPerson = trainer ? personById.get(trainer.personId) : undefined;
      const records = attendance.filter(({ sessionId }) => sessionId === session.id);
      return {
        id: session.id,
        startsAt: session.startsAt?.toISOString() ?? null,
        endsAt: session.endsAt?.toISOString() ?? null,
        program: program ? { name: program.name } : null,
        cohort: cohort ? { code: cohort.code, name: cohort.name } : null,
        trainer: trainerPerson ? { name: trainerPerson.name } : null,
        room: room ? { name: room.name } : null,
        deliveryMode: session.deliveryMode,
        status: session.status,
        attendanceWindowState: session.attendanceWindowState,
        attendance: {
          expected: records.length,
          checkedIn: records.filter(({ currentStatus }) =>
            ['PRESENT', 'LATE'].includes(currentStatus),
          ).length,
        },
      };
    });
  }
  async getRecentActivity(organizationId: string) {
    const events = await this.prisma.auditEvent.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        actorUserId: true,
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
      },
    });
    const users = await this.prisma.user.findMany({
      where: {
        organizationId,
        id: { in: events.flatMap(({ actorUserId }) => (actorUserId ? [actorUserId] : [])) },
      },
      select: { id: true, personId: true },
    });
    const people = await this.prisma.person.findMany({
      where: { organizationId, id: { in: users.map(({ personId }) => personId) } },
      select: { id: true, name: true },
    });
    const userById = new Map(users.map((user) => [user.id, user]));
    const personById = new Map(people.map((person) => [person.id, person]));
    return events.map((event) => {
      const user = event.actorUserId ? userById.get(event.actorUserId) : undefined;
      const person = user ? personById.get(user.personId) : undefined;
      return {
        id: event.id,
        actionCode: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        actor: person ? { name: person.name } : null,
        createdAt: event.createdAt.toISOString(),
      };
    });
  }
}
