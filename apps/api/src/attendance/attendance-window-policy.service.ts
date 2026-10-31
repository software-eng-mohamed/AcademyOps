import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { AttendancePolicyService } from './attendance-policy.service';

type ScheduledSession = {
  organizationId: string;
  cohortId: string;
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
};

type LockableSession = Omit<ScheduledSession, 'status'> & {
  attendanceWindowState: string;
};

@Injectable()
export class AttendanceWindowPolicyService {
  constructor(private readonly policies: AttendancePolicyService) {}

  async assertCanOpen(
    transaction: Prisma.TransactionClient,
    session: ScheduledSession,
    access?: AccessContext,
  ): Promise<void> {
    if (session.status !== 'SCHEDULED' || !session.startsAt || !session.endsAt) {
      throw new ConflictException({
        code: 'ATTENDANCE_SESSION_NOT_SCHEDULED',
        messageKey: 'attendance.sessionNotScheduled',
      });
    }
    const cohort = await transaction.cohort.findFirstOrThrow({
      where: { organizationId: session.organizationId, id: session.cohortId },
      select: { programVersionId: true, status: true },
    });
    if (cohort.status !== 'ACTIVE') {
      throw new ConflictException({
        code: 'COHORT_NOT_STARTED',
        messageKey: 'academic.cohortNotStarted',
      });
    }
    const policy = await this.policies.resolve(
      transaction,
      session.organizationId,
      cohort.programVersionId,
      session.cohortId,
      session.startsAt,
    );
    const now = Date.now();
    const opensAt = session.startsAt.getTime() - policy.checkInOpensBeforeMinutes * 60_000;
    const closesAt = session.endsAt.getTime() + policy.checkInClosesAfterMinutes * 60_000;
    if (now < opensAt || now > closesAt) {
      const canOverride =
        Boolean(access) &&
        (access?.grants.has('attendance.correct_after_lock') ||
          access?.grants.has('roles.manage') ||
          process.env.NODE_ENV !== 'production');
      if (!canOverride) {
        throw new ConflictException({
          code: 'ATTENDANCE_CHECK_IN_PERIOD_CLOSED',
          messageKey: 'attendance.checkInPeriodClosed',
        });
      }
    }
  }

  async assertNotEffectivelyLocked(
    transaction: Prisma.TransactionClient,
    session: LockableSession,
    access: AccessContext,
  ): Promise<void> {
    if (!(await this.isEffectivelyLocked(transaction, session))) return;
    if (!access.grants.has('attendance.correct_after_lock')) {
      throw new ForbiddenException({
        code: 'ATTENDANCE_CORRECTION_DENIED',
        messageKey: 'attendance.correctionDenied',
      });
    }
  }

  async isEffectivelyLocked(
    transaction: Prisma.TransactionClient,
    session: LockableSession,
  ): Promise<boolean> {
    if (session.attendanceWindowState === 'LOCKED') return true;
    if (!session.endsAt) return false;
    const cohort = await transaction.cohort.findFirstOrThrow({
      where: { organizationId: session.organizationId, id: session.cohortId },
      select: { programVersionId: true },
    });
    const policy = await this.policies.resolve(
      transaction,
      session.organizationId,
      cohort.programVersionId,
      session.cohortId,
      session.startsAt ?? session.endsAt,
    );
    return Date.now() >= session.endsAt.getTime() + policy.lockAfterMinutes * 60_000;
  }
}
