import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { IdempotencyService } from '../platform/idempotency/idempotency.service';
import { AuditService } from '../platform/audit/audit.service';
import { PrismaService } from '../platform/database/prisma.service';
import { OutboxService } from '../platform/outbox/outbox.service';
import type { CreateSessionDto, RescheduleSessionDto, SessionTrainerDto } from './academic.dto';
import { SessionSchedulePolicyService } from './session-schedule-policy.service';

export type SessionMutationResult = { id: string; status: string; version: number };

@Injectable()
export class AcademicSessionMutationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly idempotency: IdempotencyService,
    private readonly policy: SessionSchedulePolicyService,
  ) {}

  async create(
    access: AccessContext,
    input: CreateSessionDto,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<SessionMutationResult> {
    this.policy.assertManagePermission(access);
    this.policy.assertTime(input.startsAt, input.endsAt);
    this.policy.assertTrainerInput(input.trainers);
    try {
      return await this.prisma.serializable(async (transaction) => {
        const attempt = await this.idempotency.begin<SessionMutationResult>(
          transaction,
          access.organizationId,
          'academic.session.create',
          idempotencyKey,
          { actorUserId: access.actorUserId, input },
        );
        if (attempt.replayed) return attempt.response;

        const cohort = await this.policy.assertCohortAccess(
          transaction,
          access,
          input.cohortId,
          input.cohortModuleId,
        );
        await this.policy.assertRoom(
          transaction,
          access.organizationId,
          cohort.owningBranchId,
          input.roomId ?? null,
        );
        await this.policy.assertTrainers(transaction, access.organizationId, input.trainers ?? []);
        const startsAt = input.startsAt ? new Date(input.startsAt) : null;
        const endsAt = input.endsAt ? new Date(input.endsAt) : null;
        const session = await transaction.session.create({
          data: {
            organizationId: access.organizationId,
            cohortModuleId: input.cohortModuleId,
            cohortId: input.cohortId,
            roomId: input.roomId ?? null,
            ordinal: input.ordinal,
            startsAt,
            endsAt,
            deliveryMode: input.deliveryMode,
            status: startsAt ? 'SCHEDULED' : 'DRAFT',
          },
        });
        await this.createTrainers(
          transaction,
          access.organizationId,
          session.id,
          startsAt,
          endsAt,
          input.trainers ?? [],
        );
        const result = { id: session.id, status: session.status, version: session.version };
        await this.audit.write(transaction, {
          organizationId: access.organizationId,
          actorUserId: access.actorUserId,
          action: 'session.create',
          entityType: 'Session',
          entityId: session.id,
          correlationId,
          after: this.eventPayload(session, input.trainers ?? []),
        });
        await this.outbox.add(transaction, {
          organizationId: access.organizationId,
          aggregateType: 'Session',
          aggregateId: session.id,
          type: 'session.created',
          payload: this.eventPayload(session, input.trainers ?? []),
        });
        await this.idempotency.complete(transaction, attempt.recordId, 201, result);
        return result;
      });
    } catch (error) {
      this.policy.rethrowScheduleConflict(error);
    }
  }

  async reschedule(
    access: AccessContext,
    sessionId: string,
    input: RescheduleSessionDto,
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<SessionMutationResult> {
    this.policy.assertManagePermission(access);
    this.policy.assertTime(input.startsAt, input.endsAt);
    this.policy.assertTrainerInput(input.trainers);
    try {
      return await this.prisma.serializable(async (transaction) => {
        const attempt = await this.idempotency.begin<SessionMutationResult>(
          transaction,
          access.organizationId,
          'academic.session.reschedule',
          idempotencyKey,
          { actorUserId: access.actorUserId, sessionId, expectedVersion, input },
        );
        if (attempt.replayed) return attempt.response;
        const session = await this.lockSession(transaction, access, sessionId);
        this.policy.assertVersion(session.version, expectedVersion);
        this.policy.assertReschedulable(session.status);
        const cohort = await this.policy.assertCohortAccess(transaction, access, session.cohortId);
        const currentTrainers = await transaction.sessionTrainer.findMany({
          where: {
            organizationId: access.organizationId,
            sessionId,
            bookingStatus: 'CONFIRMED',
          },
          select: { trainerId: true, role: true },
        });
        const trainers =
          input.trainers ??
          currentTrainers.map(({ trainerId, role }) => ({
            trainerId,
            role: role === 'ASSISTANT' ? 'ASSISTANT' : 'PRIMARY',
          }));
        const roomId = input.roomId === undefined ? session.roomId : input.roomId;
        await this.policy.assertRoom(
          transaction,
          access.organizationId,
          cohort.owningBranchId,
          roomId,
        );
        await this.policy.assertTrainers(transaction, access.organizationId, trainers);
        await transaction.sessionTrainer.updateMany({
          where: { organizationId: access.organizationId, sessionId },
          data: { bookingStatus: 'CANCELLED' },
        });
        const updated = await transaction.session.update({
          where: { id: session.id },
          data: {
            roomId,
            startsAt: new Date(input.startsAt),
            endsAt: new Date(input.endsAt),
            status: 'SCHEDULED',
            version: { increment: 1 },
          },
        });
        await transaction.sessionTrainer.deleteMany({
          where: { organizationId: access.organizationId, sessionId },
        });
        await this.createTrainers(
          transaction,
          access.organizationId,
          sessionId,
          updated.startsAt,
          updated.endsAt,
          trainers,
        );
        const result = { id: updated.id, status: updated.status, version: updated.version };
        await this.audit.write(transaction, {
          organizationId: access.organizationId,
          actorUserId: access.actorUserId,
          action: 'session.reschedule',
          entityType: 'Session',
          entityId: session.id,
          correlationId,
          before: this.eventPayload(session, currentTrainers),
          after: { ...this.eventPayload(updated, trainers), reason: input.reason },
        });
        await this.outbox.add(transaction, {
          organizationId: access.organizationId,
          aggregateType: 'Session',
          aggregateId: session.id,
          type: 'session.rescheduled',
          payload: this.eventPayload(updated, trainers),
        });
        await this.idempotency.complete(transaction, attempt.recordId, 200, result);
        return result;
      });
    } catch (error) {
      this.policy.rethrowScheduleConflict(error);
    }
  }

  private async lockSession(
    transaction: Prisma.TransactionClient,
    access: AccessContext,
    sessionId: string,
  ) {
    await transaction.$queryRaw`SELECT id FROM sessions WHERE id = ${sessionId}::uuid AND organization_id = ${access.organizationId}::uuid FOR UPDATE`;
    const session = await transaction.session.findFirst({
      where: { id: sessionId, organizationId: access.organizationId },
    });
    if (!session) throw this.policy.sessionNotFound();
    return session;
  }

  private async createTrainers(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    sessionId: string,
    startsAt: Date | null,
    endsAt: Date | null,
    trainers: SessionTrainerDto[],
  ): Promise<void> {
    if (!trainers.length) return;
    await transaction.sessionTrainer.createMany({
      data: trainers.map((trainer) => ({
        organizationId,
        sessionId,
        trainerId: trainer.trainerId,
        startsAt,
        endsAt,
        role: trainer.role ?? 'PRIMARY',
      })),
    });
  }

  private eventPayload(
    session: {
      id: string;
      cohortId: string;
      roomId: string | null;
      startsAt: Date | null;
      endsAt: Date | null;
      status: string;
      version: number;
    },
    trainers: Array<{ trainerId: string; role?: string }>,
  ) {
    return {
      sessionId: session.id,
      cohortId: session.cohortId,
      roomId: session.roomId,
      startsAt: session.startsAt?.toISOString() ?? null,
      endsAt: session.endsAt?.toISOString() ?? null,
      status: session.status,
      version: session.version,
      trainers: trainers.map(({ trainerId, role }) => ({ trainerId, role: role ?? 'PRIMARY' })),
    };
  }
}
