import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { IdempotencyService } from '../platform/idempotency/idempotency.service';
import { AuditService } from '../platform/audit/audit.service';
import { PrismaService } from '../platform/database/prisma.service';
import { OutboxService } from '../platform/outbox/outbox.service';
import type { CancelSessionDto, CompleteSessionDto } from './academic.dto';
import type { SessionMutationResult } from './academic-session-mutation.service';
import { SessionSchedulePolicyService } from './session-schedule-policy.service';

@Injectable()
export class AcademicSessionLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly idempotency: IdempotencyService,
    private readonly policy: SessionSchedulePolicyService,
  ) {}

  async cancel(
    access: AccessContext,
    sessionId: string,
    input: CancelSessionDto,
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<SessionMutationResult> {
    this.policy.assertManagePermission(access);
    return this.prisma.serializable(async (transaction) => {
      const attempt = await this.idempotency.begin<SessionMutationResult>(
        transaction,
        access.organizationId,
        'academic.session.cancel',
        idempotencyKey,
        { actorUserId: access.actorUserId, sessionId, expectedVersion, input },
      );
      if (attempt.replayed) return attempt.response;
      const session = await this.lockSession(transaction, access, sessionId);
      this.policy.assertVersion(session.version, expectedVersion);
      this.policy.assertCancellable(session.status);
      await this.policy.assertCohortAccess(transaction, access, session.cohortId);
      const updated = await transaction.session.update({
        where: { id: session.id },
        data: { status: 'CANCELLED', version: { increment: 1 } },
      });
      await transaction.sessionTrainer.updateMany({
        where: { organizationId: access.organizationId, sessionId },
        data: { bookingStatus: 'CANCELLED' },
      });
      const result = { id: updated.id, status: updated.status, version: updated.version };
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'session.cancel',
        entityType: 'Session',
        entityId: session.id,
        correlationId,
        before: this.eventPayload(session),
        after: { ...this.eventPayload(updated), reason: input.reason },
      });
      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'Session',
        aggregateId: session.id,
        type: 'session.cancelled',
        payload: this.eventPayload(updated),
      });
      await this.idempotency.complete(transaction, attempt.recordId, 200, result);
      return result;
    });
  }

  async complete(
    access: AccessContext,
    sessionId: string,
    input: CompleteSessionDto,
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<SessionMutationResult> {
    this.policy.assertManagePermission(access);
    return this.prisma.serializable(async (transaction) => {
      const attempt = await this.idempotency.begin<SessionMutationResult>(
        transaction,
        access.organizationId,
        'academic.session.complete',
        idempotencyKey,
        { actorUserId: access.actorUserId, sessionId, expectedVersion, input },
      );
      if (attempt.replayed) return attempt.response;
      const session = await this.lockSession(transaction, access, sessionId);
      this.policy.assertVersion(session.version, expectedVersion);
      this.policy.assertCompletable(session.status, session.endsAt);
      await this.policy.assertCohortAccess(transaction, access, session.cohortId);
      const updated = await transaction.session.update({
        where: { id: session.id },
        data: { status: 'COMPLETED', version: { increment: 1 } },
      });
      const result = { id: updated.id, status: updated.status, version: updated.version };
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'session.complete',
        entityType: 'Session',
        entityId: session.id,
        correlationId,
        before: this.eventPayload(session),
        after: { ...this.eventPayload(updated), ...(input.note ? { note: input.note } : {}) },
      });
      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'Session',
        aggregateId: session.id,
        type: 'session.completed',
        payload: this.eventPayload(updated),
      });
      await this.idempotency.complete(transaction, attempt.recordId, 200, result);
      return result;
    });
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

  private eventPayload(session: {
    id: string;
    cohortId: string;
    roomId: string | null;
    startsAt: Date | null;
    endsAt: Date | null;
    status: string;
    version: number;
  }) {
    return {
      sessionId: session.id,
      cohortId: session.cohortId,
      roomId: session.roomId,
      startsAt: session.startsAt?.toISOString() ?? null,
      endsAt: session.endsAt?.toISOString() ?? null,
      status: session.status,
      version: session.version,
    };
  }
}
