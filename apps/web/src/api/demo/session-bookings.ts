import {
  baseRecord,
  type DemoRecord,
  type DemoState,
  find,
  nextId,
  object,
  records,
  string,
} from './shared';

export function trainersFor(
  state: DemoState,
  value: unknown,
  sessionId: string,
  startsAt: string,
  endsAt: string,
): DemoRecord[] | null {
  if (!Array.isArray(value) || value.length > 25) return null;
  const values = value.map(object);
  if (
    new Set(values.map((entry) => entry.trainerId)).size !== values.length ||
    values.some(
      (entry) =>
        !find(state, 'trainers', entry.trainerId) ||
        !['PRIMARY', 'ASSISTANT'].includes(string(entry.role ?? 'PRIMARY')),
    )
  )
    return null;
  return values.map((entry) =>
    baseRecord(nextId(state), {
      trainerId: entry.trainerId,
      trainer: find(state, 'trainers', entry.trainerId),
      role: entry.role ?? 'PRIMARY',
      sessionId,
      startsAt,
      endsAt,
      bookingStatus: 'CONFIRMED',
    }),
  );
}

export function hasBookingConflict(state: DemoState, candidate: DemoRecord) {
  const trainerIds = Array.isArray(candidate.trainers)
    ? candidate.trainers.map((entry) => object(entry).trainerId)
    : [];
  return records(state, 'sessions').some((session) => {
    if (session.id === candidate.id || session.status === 'CANCELLED') return false;
    if (
      session.cohortModuleId === candidate.cohortModuleId &&
      session.ordinal === candidate.ordinal
    )
      return true;
    const overlaps =
      string(session.startsAt) < string(candidate.endsAt) &&
      string(session.endsAt) > string(candidate.startsAt);
    return (
      overlaps &&
      (session.cohortId === candidate.cohortId ||
        Boolean(candidate.roomId && candidate.roomId === session.roomId) ||
        (Array.isArray(session.trainers) &&
          session.trainers.some((entry) => trainerIds.includes(object(entry).trainerId))))
    );
  });
}
