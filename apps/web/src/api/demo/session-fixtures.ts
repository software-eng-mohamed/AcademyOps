import {
  baseRecord,
  type DemoRecord,
  type DemoState,
  demoId,
  find,
  object,
  records,
  timestamp,
} from './shared';

export function sessionFixtures(state: DemoState): Record<string, DemoRecord[]> {
  const sessions = Array.from({ length: 9 }, (_, index) => {
    const group = index % 3;
    const cohort = find(state, 'cohorts', demoId(150 + group)) ?? null;
    const module = find(state, 'modules', demoId(120 + group * 3)) ?? null;
    const trainer = find(state, 'trainers', demoId(170 + group)) ?? null;
    const room = find(state, 'rooms', demoId(160 + (group % 2))) ?? null;
    const day = Math.floor(index / 3) - 1;
    return baseRecord(demoId(1000 + index), {
      cohortId: cohort?.id,
      cohort,
      cohortModuleId: demoId(550 + group * 3),
      module,
      roomId: room?.id,
      room,
      ordinal: index + 1,
      deliveryMode: 'IN_PERSON',
      startsAt: timestamp(day, 8 + group * 3),
      endsAt: timestamp(day, 10 + group * 3),
      status: day < 0 ? 'COMPLETED' : 'SCHEDULED',
      attendanceWindowState: day < 0 ? 'CLOSED' : 'OPEN',
      attendanceLockedAt: null,
      coordinatorName: 'Demo Owner',
      trainers: [
        baseRecord(demoId(1050 + index), {
          trainer,
          trainerId: trainer?.id,
          sessionId: demoId(1000 + index),
          startsAt: timestamp(day, 8 + group * 3),
          endsAt: timestamp(day, 10 + group * 3),
          role: 'PRIMARY',
          bookingStatus: 'CONFIRMED',
        }),
      ],
    });
  });
  const attendance = sessions
    .filter((session) => String(session.startsAt).slice(0, 10) <= timestamp().slice(0, 10))
    .flatMap((session, sessionIndex) =>
      records(state, 'enrollments')
        .filter((item) => item.cohortId === session.cohortId)
        .slice(0, 3)
        .map((enrollment, index) =>
          baseRecord(demoId(1100 + sessionIndex * 10 + index), {
            sessionId: session.id,
            enrollmentId: enrollment.id,
            status: index === 2 ? 'LATE' : 'PRESENT',
            effectiveStatus: index === 2 ? 'LATE' : 'PRESENT',
            source: 'MANUAL',
            recordedAt: session.startsAt,
            recordedByUserId: demoId(3),
            reason: 'Synthetic classroom register',
          }),
        ),
    );
  return {
    sessions,
    attendance,
    attendancePolicies: [
      baseRecord(demoId(1200), {
        programVersionId: demoId(110),
        cohortId: null,
        minimumRatio: '0.8000',
        lateCountsAsPresent: true,
        excusedCountsAsPresent: false,
        makeupCountsAsPresent: true,
        lockAfterMinutes: 1440,
        checkInOpensBeforeMinutes: 30,
        checkInClosesAfterMinutes: 30,
        version: 1,
        isActive: true,
      }),
    ],
  };
}

export function roster(state: DemoState, session: DemoRecord) {
  return records(state, 'enrollments')
    .filter((item) => item.cohortId === session.cohortId)
    .map((enrollment) => {
      const student =
        find(state, 'students', enrollment.studentPersonId) ?? object(enrollment.student);
      const attendance =
        records(state, 'attendance').find(
          (item) => item.sessionId === session.id && item.enrollmentId === enrollment.id,
        ) ?? null;
      return {
        enrollmentId: enrollment.id,
        student: { id: student.id, name: student.name, publicId: student.publicId },
        attendance,
        effectiveStatus: attendance?.status ?? 'UNMARKED',
      };
    });
}
