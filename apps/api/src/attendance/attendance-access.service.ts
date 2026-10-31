import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, Session } from '@prisma/client';
import type { AccessContext, PermissionCode } from '@academyops/contracts';

@Injectable()
export class AttendanceAccessService {
  async assertSession(
    transaction: Prisma.TransactionClient,
    access: AccessContext,
    permission: PermissionCode,
    sessionId: string,
  ): Promise<Session> {
    const session = await transaction.session.findFirst({
      where: { organizationId: access.organizationId, id: sessionId },
    });
    if (!session) throw this.notFound();

    const scopes = access.grants.get(permission);
    if (scopes?.has('O')) return session;

    if (scopes?.has('B') && access.branchIds.size) {
      const cohort = await transaction.cohort.findFirst({
        where: {
          organizationId: access.organizationId,
          id: session.cohortId,
          owningBranchId: { in: [...access.branchIds] },
        },
        select: { id: true },
      });
      if (cohort) return session;
    }

    if (scopes?.has('A')) {
      if (access.assignedResourceIds.has(session.id)) return session;
      const user = await transaction.user.findFirst({
        where: { organizationId: access.organizationId, id: access.actorUserId },
        select: { personId: true },
      });
      const trainer = user
        ? await transaction.trainerProfile.findFirst({
            where: {
              organizationId: access.organizationId,
              personId: user.personId,
              status: 'ACTIVE',
            },
            select: { id: true },
          })
        : null;
      const assignment = trainer
        ? await transaction.sessionTrainer.findFirst({
            where: {
              organizationId: access.organizationId,
              sessionId: session.id,
              trainerId: trainer.id,
              bookingStatus: 'CONFIRMED',
            },
            select: { id: true },
          })
        : null;
      if (assignment) return session;
    }

    if (scopes?.has('S') && access.studentPersonId) {
      if (session.status === 'DRAFT') throw this.notFound();
      const enrollments = await transaction.enrollment.findMany({
        where: {
          organizationId: access.organizationId,
          studentPersonId: access.studentPersonId,
        },
        select: { id: true },
      });
      const rostered = await this.findRosterAssignment(
        transaction,
        access.organizationId,
        session,
        enrollments.map(({ id }) => id),
      );
      if (rostered) return session;
    }

    throw this.notFound();
  }

  async assertEnrollmentInSession(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    session: Session,
    enrollmentId: string,
  ) {
    const enrollment = await transaction.enrollment.findFirst({
      where: { organizationId, id: enrollmentId },
    });
    if (!enrollment) throw this.notFound();
    const rostered = await this.findRosterAssignment(transaction, organizationId, session, [
      enrollment.id,
    ]);
    if (!rostered) throw this.notFound();
    return enrollment;
  }

  async assertEnrollment(
    transaction: Prisma.TransactionClient,
    access: AccessContext,
    permission: PermissionCode,
    enrollmentId: string,
  ) {
    const enrollment = await transaction.enrollment.findFirst({
      where: { organizationId: access.organizationId, id: enrollmentId },
    });
    if (!enrollment) throw this.notFound();

    const scopes = access.grants.get(permission);
    if (scopes?.has('O')) return enrollment;
    if (scopes?.has('S') && enrollment.studentPersonId === access.studentPersonId)
      return enrollment;

    const assignments = await transaction.enrollmentCohortAssignment.findMany({
      where: { organizationId: access.organizationId, enrollmentId },
      select: { cohortId: true },
    });
    const cohortIds = [...new Set(assignments.map(({ cohortId }) => cohortId))];

    if (scopes?.has('B') && access.branchIds.size && cohortIds.length) {
      const cohort = await transaction.cohort.findFirst({
        where: {
          organizationId: access.organizationId,
          id: { in: cohortIds },
          owningBranchId: { in: [...access.branchIds] },
        },
        select: { id: true },
      });
      if (cohort) return enrollment;
    }

    if (scopes?.has('A') && cohortIds.length) {
      const user = await transaction.user.findFirst({
        where: { organizationId: access.organizationId, id: access.actorUserId },
        select: { personId: true },
      });
      const trainer = user
        ? await transaction.trainerProfile.findFirst({
            where: {
              organizationId: access.organizationId,
              personId: user.personId,
              status: 'ACTIVE',
            },
            select: { id: true },
          })
        : null;
      const session = trainer
        ? await transaction.sessionTrainer.findFirst({
            where: {
              organizationId: access.organizationId,
              trainerId: trainer.id,
              bookingStatus: 'CONFIRMED',
              sessionId: {
                in: (
                  await transaction.session.findMany({
                    where: { organizationId: access.organizationId, cohortId: { in: cohortIds } },
                    select: { id: true },
                  })
                ).map(({ id }) => id),
              },
            },
            select: { id: true },
          })
        : null;
      if (session) return enrollment;
    }

    throw this.notFound();
  }

  async assertRecord(
    transaction: Prisma.TransactionClient,
    access: AccessContext,
    permission: PermissionCode,
    recordId: string,
  ) {
    const record = await transaction.attendanceRecord.findFirst({
      where: { organizationId: access.organizationId, id: recordId },
    });
    if (!record) throw this.notFound();
    const session = await this.assertSession(transaction, access, permission, record.sessionId);
    const scopes = access.grants.get(permission);
    if (scopes?.has('S') && !(['O', 'B', 'A'] as const).some((scope) => scopes.has(scope))) {
      await this.assertEnrollment(transaction, access, permission, record.enrollmentId);
    }
    return { record, session };
  }

  private async findRosterAssignment(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    session: Pick<Session, 'cohortId' | 'startsAt' | 'endsAt'>,
    enrollmentIds: string[],
  ) {
    if (!enrollmentIds.length) return null;
    const at = session.startsAt ?? session.endsAt;
    return transaction.enrollmentCohortAssignment.findFirst({
      where: {
        organizationId,
        enrollmentId: { in: enrollmentIds },
        cohortId: session.cohortId,
        ...(at
          ? {
              startsAt: { lte: at },
              OR: [{ endsAt: null }, { endsAt: { gt: at } }],
            }
          : {}),
      },
      select: { id: true },
    });
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'ATTENDANCE_RESOURCE_NOT_FOUND',
      messageKey: 'attendance.resourceNotFound',
    });
  }
}
