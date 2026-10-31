import type { Session } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { FixtureContext, StudentFixture } from './types';

function enrollmentFor(session: Session, students: StudentFixture[]): StudentFixture {
  const result = students.find((value) => value.academic.cohort.id === session.cohortId);
  if (!result) throw new Error(`No synthetic enrollment for session ${session.id}.`);
  return result;
}

export async function seedAttendance(
  ctx: FixtureContext,
  pastSessions: Session[],
  students: StudentFixture[],
): Promise<void> {
  for (const [index, session] of pastSessions.entries()) {
    const student = enrollmentFor(session, students);
    const status = index === pastSessions.length - 1 ? 'LATE' : 'PRESENT';
    const existing = await ctx.prisma.attendanceRecord.findUnique({
      where: {
        organizationId_sessionId_enrollmentId: {
          organizationId: ctx.organization.id,
          sessionId: session.id,
          enrollmentId: student.enrollment.id,
        },
      },
    });
    if (existing) continue;
    const recordId = randomUUID();
    await ctx.prisma.$transaction([
      ctx.prisma.attendanceRecord.create({
        data: {
          id: recordId,
          organizationId: ctx.organization.id,
          sessionId: session.id,
          enrollmentId: student.enrollment.id,
          currentStatus: status,
          source: 'MANUAL',
          recordedAt: session.startsAt!,
          recordedBy: ctx.users.attendance.id,
        },
      }),
      ctx.prisma.attendanceEvent.create({
        data: {
          organizationId: ctx.organization.id,
          attendanceRecordId: recordId,
          version: 1,
          toStatus: status,
          reason: 'Synthetic E2E fixture',
          actorUserId: ctx.users.attendance.id,
        },
      }),
    ]);
  }
}
