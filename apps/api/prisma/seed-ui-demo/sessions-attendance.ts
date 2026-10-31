import { randomUUID } from 'node:crypto';
import type { Enrollment, Organization, Room, TrainerProfile, User } from '@prisma/client';
import type { CohortWithDetails, SeedUiDemoContext } from './types';
import { cairoTodayAt } from './utils';

export async function seedSessionsAndAttendance(
  ctx: SeedUiDemoContext,
  input: {
    organization: Organization;
    cohorts: CohortWithDetails[];
    rooms: Room[];
    trainer: TrainerProfile;
    enrollments: Enrollment[];
    demoUser: User;
  },
): Promise<void> {
  const { prisma } = ctx;
  const { organization, cohorts, rooms, trainer, enrollments, demoUser } = input;

  for (const [index, value] of cohorts.entries()) {
    let session = await prisma.session.findFirst({
      where: { organizationId: organization.id, cohortId: value.cohort.id, ordinal: 99 },
    });
    if (!session)
      session = await prisma.session.create({
        data: {
          organizationId: organization.id,
          cohortModuleId: value.cohortModule.id,
          cohortId: value.cohort.id,
          roomId: rooms[index]!.id,
          ordinal: 99,
          startsAt: cairoTodayAt(index ? 14 : 10),
          endsAt: cairoTodayAt(index ? 17 : 13),
          deliveryMode: 'IN_PERSON',
          status: 'SCHEDULED',
          attendanceWindowState: 'SCHEDULED',
        },
      });
    else
      session = await prisma.session.update({
        where: { id: session.id },
        data: {
          startsAt: cairoTodayAt(index ? 14 : 10),
          endsAt: cairoTodayAt(index ? 17 : 13),
          status: 'SCHEDULED',
          attendanceWindowState: 'SCHEDULED',
        },
      });
    const trainerAssignment = await prisma.sessionTrainer.findFirst({
      where: { organizationId: organization.id, sessionId: session.id, trainerId: trainer.id },
    });
    if (!trainerAssignment)
      await prisma.sessionTrainer.create({
        data: {
          organizationId: organization.id,
          sessionId: session.id,
          trainerId: trainer.id,
          startsAt: session.startsAt,
          endsAt: session.endsAt,
        },
      });
    const cohortEnrollments = enrollments.filter((_, enrollmentIndex) =>
      index === 0 ? enrollmentIndex < 5 : enrollmentIndex >= 5,
    );
    for (const [studentIndex, enrollment] of cohortEnrollments.entries()) {
      const existingRecord = await prisma.attendanceRecord.findUnique({
        where: {
          organizationId_sessionId_enrollmentId: {
            organizationId: organization.id,
            sessionId: session.id,
            enrollmentId: enrollment.id,
          },
        },
      });
      if (!existingRecord) {
        const recordId = randomUUID();
        const status =
          studentIndex === cohortEnrollments.length - 1
            ? 'ABSENT'
            : studentIndex % 3 === 0
              ? 'LATE'
              : 'PRESENT';
        await prisma.$transaction([
          prisma.attendanceRecord.create({
            data: {
              id: recordId,
              organizationId: organization.id,
              sessionId: session.id,
              enrollmentId: enrollment.id,
              currentStatus: status,
              source: 'MANUAL',
              recordedAt: session.startsAt!,
              recordedBy: demoUser.id,
            },
          }),
          prisma.attendanceEvent.create({
            data: {
              organizationId: organization.id,
              attendanceRecordId: recordId,
              version: 1,
              toStatus: status,
              reason: 'Development fixture',
              actorUserId: demoUser.id,
            },
          }),
        ]);
      }
    }
  }
}
