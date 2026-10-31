import type { PrismaService } from '../platform/database/prisma.service';

export async function enrichRooms<T extends { id: string; capacity: number | null }>(
  prisma: PrismaService,
  organizationId: string,
  rooms: T[],
) {
  if (!rooms.length) return [];
  const sessions = await prisma.session.findMany({
    where: {
      organizationId,
      roomId: { in: rooms.map(({ id }) => id) },
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
      firstSessionAt: dateBoundary(starts, Math.min),
      lastSessionAt: dateBoundary(ends, Math.max),
      capacitySource: room.capacity === null ? 'NOT_PROVIDED' : 'SYSTEM',
    };
  });
}

export async function enrichTrainers<T extends { id: string }>(
  prisma: PrismaService,
  organizationId: string,
  trainers: T[],
) {
  if (!trainers.length) return [];
  const assignments = await prisma.sessionTrainer.findMany({
    where: {
      organizationId,
      trainerId: { in: trainers.map(({ id }) => id) },
      bookingStatus: 'CONFIRMED',
    },
    select: { trainerId: true, sessionId: true },
  });
  const sessions = await prisma.session.findMany({
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
      firstSessionAt: dateBoundary(starts, Math.min),
      lastSessionAt: dateBoundary(ends, Math.max),
    };
  });
}

function dateBoundary(values: Date[], operation: (...values: number[]) => number) {
  return values.length
    ? new Date(operation(...values.map((value) => value.getTime()))).toISOString()
    : null;
}
