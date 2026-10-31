import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { PlannedSubject } from './plan';

const chunkSize = 500;

async function chunks<T>(items: T[], operation: (chunk: T[]) => Promise<unknown>): Promise<void> {
  for (let index = 0; index < items.length; index += chunkSize) {
    await operation(items.slice(index, index + chunkSize));
  }
}

export interface DomainEnrollment {
  subject: PlannedSubject;
  personId: string;
  userId: string;
  billingAccountId: string;
  enrollmentId: string;
  cohortId: string;
  programVersionId: string;
}

export interface AcademicDomainResult {
  enrollments: DomainEnrollment[];
  attendanceSessionId: string;
}

export async function seedAcademicDomain(
  prisma: PrismaClient,
  organizationId: string,
  branchId: string,
  actorUserId: string,
  plan: PlannedSubject[],
  peopleByPublicId: Map<string, string>,
  usersByPersonId: Map<string, string>,
): Promise<AcademicDomainResult> {
  const cohorts = await prisma.cohort.findMany({
    where: { organizationId, code: { startsWith: 'E2E-COURSE-' }, status: 'ACTIVE' },
    orderBy: { code: 'asc' },
    select: { id: true, programVersionId: true },
  });
  if (cohorts.length < 2) throw new Error('Two active synthetic cohorts are required.');
  const students = plan.filter((item) => item.role === 'student');
  const enrollments = students.map((subject, index): DomainEnrollment => {
    const personId = peopleByPublicId.get(subject.publicId)!;
    const cohort = cohorts[index % cohorts.length]!;
    return {
      subject,
      personId,
      userId: usersByPersonId.get(personId)!,
      billingAccountId: randomUUID(),
      enrollmentId: randomUUID(),
      cohortId: cohort.id,
      programVersionId: cohort.programVersionId,
    };
  });
  await chunks(enrollments, (items) =>
    prisma.billingAccount.createMany({
      data: items.map((item) => ({
        id: item.billingAccountId,
        organizationId,
        kind: 'INDIVIDUAL',
        personId: item.personId,
        currencyCode: 'EGP',
      })),
    }),
  );
  const activatedAt = new Date(Date.now() - 30 * 86_400_000);
  await chunks(enrollments, (items) =>
    prisma.enrollment.createMany({
      data: items.map((item) => ({
        id: item.enrollmentId,
        organizationId,
        studentPersonId: item.personId,
        programVersionId: item.programVersionId,
        billingAccountId: item.billingAccountId,
        homeBranchId: branchId,
        kind: 'INDIVIDUAL',
        state: 'ACTIVE',
        activatedAt,
      })),
    }),
  );
  await chunks(enrollments, (items) =>
    prisma.enrollmentCohortAssignment.createMany({
      data: items.map((item) => ({
        organizationId,
        enrollmentId: item.enrollmentId,
        cohortId: item.cohortId,
        startsAt: activatedAt,
        reason: 'Synthetic load fixture',
        createdBy: actorUserId,
      })),
    }),
  );
  const sessions = await prisma.session.findMany({
    where: {
      organizationId,
      cohortId: { in: cohorts.map((cohort) => cohort.id) },
      status: 'COMPLETED',
    },
    orderBy: [{ cohortId: 'asc' }, { ordinal: 'asc' }],
    select: { id: true, cohortId: true, endsAt: true },
  });
  const sessionsByCohort = new Map(
    cohorts.map((cohort) => [
      cohort.id,
      sessions.filter((session) => session.cohortId === cohort.id).slice(0, 2),
    ]),
  );
  if ([...sessionsByCohort.values()].some((items) => items.length !== 2)) {
    throw new Error('Each synthetic cohort needs two completed attendance sessions.');
  }
  const attendance = enrollments.flatMap((item) =>
    sessionsByCohort.get(item.cohortId)!.map((session, sessionIndex) => {
      const marker = (item.subject.roleIndex + sessionIndex) % 20;
      return {
        id: randomUUID(),
        organizationId,
        sessionId: session.id,
        enrollmentId: item.enrollmentId,
        currentStatus: marker === 0 ? 'ABSENT' : marker <= 2 ? 'LATE' : 'PRESENT',
        source: 'MANUAL',
        recordedAt: session.endsAt ?? new Date(),
        recordedBy: actorUserId,
      };
    }),
  );
  await chunks(attendance, (items) =>
    prisma.$transaction(async (transaction) => {
      await transaction.attendanceRecord.createMany({ data: items });
      await transaction.attendanceEvent.createMany({
        data: items.map((item) => ({
          organizationId,
          attendanceRecordId: item.id,
          version: 1,
          fromStatus: 'UNMARKED',
          toStatus: item.currentStatus,
          reason: 'Synthetic load fixture',
          actorUserId,
          occurredAt: item.recordedAt,
        })),
      });
    }),
  );
  return { enrollments, attendanceSessionId: sessions[0]!.id };
}
