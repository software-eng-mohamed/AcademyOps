import type { PrismaService } from '../platform/database/prisma.service';

export class CatalogResourceSchedules {
  constructor(private readonly prisma: PrismaService) {}
  async enrichRooms<
    T extends {
      id: string;
      capacity: number | null;
    },
  >(organizationId: string, rooms: T[], sessionIds?: string[]) {
    if (!rooms.length) return [];
    const sessions = await this.prisma.session.findMany({
      where: {
        organizationId,
        roomId: { in: rooms.map(({ id }) => id) },
        ...(sessionIds ? { id: { in: sessionIds } } : {}),
        startsAt: { not: null },
        status: { not: 'DRAFT' },
      },
      select: { roomId: true, cohortId: true, startsAt: true, endsAt: true },
    });
    return rooms.map((room) => {
      const assigned = sessions.filter(({ roomId }) => roomId === room.id);
      const starts = assigned.flatMap(({ startsAt }) => (startsAt ? [startsAt] : []));
      const ends = assigned.flatMap(({ endsAt }) => (endsAt ? [endsAt] : []));
      return {
        ...room,
        scheduledSessions: assigned.length,
        cohortCount: new Set(assigned.map(({ cohortId }) => cohortId)).size,
        firstSessionAt: starts.length
          ? new Date(Math.min(...starts.map((value) => value.getTime()))).toISOString()
          : null,
        lastSessionAt: ends.length
          ? new Date(Math.max(...ends.map((value) => value.getTime()))).toISOString()
          : null,
        capacitySource: room.capacity === null ? 'NOT_PROVIDED' : 'SYSTEM',
      };
    });
  }
  async enrichTrainers<
    T extends {
      id: string;
    },
  >(organizationId: string, trainers: T[]) {
    if (!trainers.length) return [];
    const assignments = await this.prisma.sessionTrainer.findMany({
      where: {
        organizationId,
        trainerId: { in: trainers.map(({ id }) => id) },
        bookingStatus: 'CONFIRMED',
      },
      select: { trainerId: true, sessionId: true },
    });
    const sessions = await this.prisma.session.findMany({
      where: {
        organizationId,
        id: { in: assignments.map(({ sessionId }) => sessionId) },
        startsAt: { not: null },
        status: { not: 'DRAFT' },
      },
      select: { id: true, cohortId: true, startsAt: true, endsAt: true },
    });
    return trainers.map((trainer) => {
      const sessionIds = new Set(
        assignments
          .filter(({ trainerId }) => trainerId === trainer.id)
          .map(({ sessionId }) => sessionId),
      );
      const assigned = sessions.filter(({ id }) => sessionIds.has(id));
      const starts = assigned.flatMap(({ startsAt }) => (startsAt ? [startsAt] : []));
      const ends = assigned.flatMap(({ endsAt }) => (endsAt ? [endsAt] : []));
      return {
        ...trainer,
        scheduledSessions: assigned.length,
        cohortCount: new Set(assigned.map(({ cohortId }) => cohortId)).size,
        firstSessionAt: starts.length
          ? new Date(Math.min(...starts.map((value) => value.getTime()))).toISOString()
          : null,
        lastSessionAt: ends.length
          ? new Date(Math.max(...ends.map((value) => value.getTime()))).toISOString()
          : null,
      };
    });
  }
}
