import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import type { SessionTrainerDto } from './academic.dto';

type Transaction = Prisma.TransactionClient;

@Injectable()
export class SessionSchedulePolicyService {
  assertManagePermission(access: AccessContext): void {
    const scopes = access.grants.get('academic.sessions.manage');
    if (!scopes?.has('O') && !scopes?.has('B')) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        messageKey: 'auth.permissionDenied',
      });
    }
  }

  assertTime(startsAt?: string, endsAt?: string): void {
    const starts = startsAt ? Date.parse(startsAt) : Number.NaN;
    const ends = endsAt ? Date.parse(endsAt) : Number.NaN;
    const incomplete = Boolean(startsAt) !== Boolean(endsAt);
    const invalid = Boolean(startsAt) && (!Number.isFinite(starts) || !Number.isFinite(ends));
    if (incomplete || invalid || (startsAt && ends <= starts)) {
      throw this.conflict('SESSION_TIME_INVALID', 'academic.sessionTimeInvalid');
    }
  }

  assertTrainerInput(trainers?: SessionTrainerDto[]): void {
    if (!trainers) return;
    const uniqueIds = new Set(trainers.map(({ trainerId }) => trainerId));
    if (uniqueIds.size !== trainers.length) {
      throw this.conflict('SESSION_TRAINER_DUPLICATE', 'academic.sessionTrainerDuplicate');
    }
  }

  async assertCohortAccess(
    transaction: Transaction,
    access: AccessContext,
    cohortId: string,
    cohortModuleId?: string,
  ) {
    const cohort = await transaction.cohort.findFirst({
      where: { id: cohortId, organizationId: access.organizationId },
    });
    const scopes = access.grants.get('academic.sessions.manage');
    if (!cohort || (!scopes?.has('O') && !access.branchIds.has(cohort.owningBranchId))) {
      throw this.notFound('COHORT_NOT_FOUND', 'academic.cohortNotFound');
    }
    if (cohortModuleId) {
      const module = await transaction.cohortModule.findFirst({
        where: {
          id: cohortModuleId,
          organizationId: access.organizationId,
          cohortId: cohort.id,
        },
        select: { id: true },
      });
      if (!module) {
        throw this.notFound('COHORT_MODULE_NOT_FOUND', 'academic.cohortModuleNotFound');
      }
    }
    return cohort;
  }

  async assertRoom(
    transaction: Transaction,
    organizationId: string,
    branchId: string,
    roomId: string | null,
  ): Promise<void> {
    if (!roomId) return;
    const room = await transaction.room.findFirst({
      where: { id: roomId, organizationId, branchId, isActive: true },
      select: { id: true },
    });
    if (!room) throw this.notFound('ROOM_NOT_FOUND', 'academic.roomNotFound');
  }

  async assertTrainers(
    transaction: Transaction,
    organizationId: string,
    trainers: SessionTrainerDto[],
  ): Promise<void> {
    this.assertTrainerInput(trainers);
    if (!trainers.length) return;
    const active = await transaction.trainerProfile.count({
      where: {
        organizationId,
        id: { in: trainers.map(({ trainerId }) => trainerId) },
        status: 'ACTIVE',
      },
    });
    if (active !== trainers.length) {
      throw this.notFound('TRAINER_NOT_FOUND', 'academic.trainerNotFound');
    }
  }

  assertVersion(actual: number, expected: number): void {
    if (actual !== expected) {
      throw this.conflict('VERSION_CONFLICT', 'errors.versionConflict');
    }
  }

  assertReschedulable(status: string): void {
    if (!['DRAFT', 'SCHEDULED'].includes(status)) {
      throw this.conflict('SESSION_TRANSITION_INVALID', 'academic.sessionTransitionInvalid');
    }
  }

  assertCancellable(status: string): void {
    if (!['DRAFT', 'SCHEDULED'].includes(status)) {
      throw this.conflict('SESSION_TRANSITION_INVALID', 'academic.sessionTransitionInvalid');
    }
  }

  assertCompletable(status: string, endsAt: Date | null, now = new Date()): void {
    if (status !== 'SCHEDULED') {
      throw this.conflict('SESSION_TRANSITION_INVALID', 'academic.sessionTransitionInvalid');
    }
    if (!endsAt || endsAt > now) {
      throw this.conflict('SESSION_NOT_FINISHED', 'academic.sessionNotFinished');
    }
  }

  rethrowScheduleConflict(error: unknown): never {
    const knownConflict =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2002', 'P2004'].includes(error.code);
    const unknownConstraintConflict =
      error instanceof Prisma.PrismaClientUnknownRequestError &&
      ['sessions_room_no_overlap', 'session_trainers_no_overlap'].some((constraint) =>
        error.message.includes(constraint),
      );
    if (knownConflict || unknownConstraintConflict) {
      throw this.conflict('SCHEDULE_CONFLICT', 'academic.scheduleConflict');
    }
    throw error;
  }

  sessionNotFound(): NotFoundException {
    return this.notFound('SESSION_NOT_FOUND', 'academic.sessionNotFound');
  }

  private conflict(code: string, messageKey: string): ConflictException {
    return new ConflictException({ code, messageKey });
  }

  private notFound(code: string, messageKey: string): NotFoundException {
    return new NotFoundException({ code, messageKey });
  }
}
