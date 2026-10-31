import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { PrismaService } from '../platform/database/prisma.service';
import { AuditService } from '../platform/audit/audit.service';
import { OutboxService } from '../platform/outbox/outbox.service';
import { IdempotencyService } from '../platform/idempotency/idempotency.service';
import { EnrollmentQueryService } from './enrollment-query.service';
import { EnrollmentEventService } from './enrollment-event.service';
import type { MutationMeta } from './enrollment-event.service';
import { nextState, versionConflict } from './enrollment-common';

export type CancellationRequestMeta = MutationMeta & {
  idempotencyKey: string;
  reason: string;
};

export type CancellationRequestResult = {
  id: string;
  enrollmentId: string;
  status: string;
};

export type IdempotentMeta = {
  correlationId: string;
  idempotencyKey: string;
};

@Injectable()
export class EnrollmentCancellationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly idempotency: IdempotencyService,
    private readonly queryService: EnrollmentQueryService,
    private readonly eventService: EnrollmentEventService,
  ) {}

  async requestCancellation(
    access: AccessContext,
    enrollmentId: string,
    meta: CancellationRequestMeta,
  ): Promise<CancellationRequestResult> {
    return this.prisma.serializable(async (transaction) => {
      const attempt = await this.idempotency.begin<CancellationRequestResult>(
        transaction,
        access.organizationId,
        'enrollment.cancellation.request',
        meta.idempotencyKey,
        {
          enrollmentId,
          expectedVersion: meta.expectedVersion,
          reason: meta.reason,
        },
      );
      if (attempt.replayed) return attempt.response;
      await transaction.$queryRaw`SELECT id FROM enrollments WHERE id = ${enrollmentId}::uuid AND organization_id = ${access.organizationId}::uuid FOR UPDATE`;
      const enrollment = await this.queryService.findScoped(
        transaction,
        access,
        enrollmentId,
        'enrollments.cancel.request',
      );
      nextState(enrollment.state, 'cancel');
      if (enrollment.version !== meta.expectedVersion) throw versionConflict();
      const open = await transaction.enrollmentCancellationRequest.findFirst({
        where: {
          organizationId: access.organizationId,
          enrollmentId,
          status: 'REQUESTED',
        },
      });
      if (open) {
        throw new ConflictException({
          code: 'CANCELLATION_REQUEST_EXISTS',
          messageKey: 'enrollments.cancellationRequestExists',
        });
      }
      const request = await transaction.enrollmentCancellationRequest.create({
        data: {
          organizationId: access.organizationId,
          enrollmentId,
          enrollmentVersion: enrollment.version,
          reason: meta.reason,
          requestedBy: access.actorUserId,
        },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'enrollment.cancellation.request',
        entityType: 'EnrollmentCancellationRequest',
        entityId: request.id,
        correlationId: meta.correlationId,
        after: {
          enrollmentId,
          enrollmentVersion: enrollment.version,
          reason: meta.reason,
        },
      });
      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'EnrollmentCancellationRequest',
        aggregateId: request.id,
        type: 'enrollment.cancellation.requested',
        payload: { requestId: request.id, enrollmentId },
      });
      const result = { id: request.id, enrollmentId, status: request.status };
      await this.idempotency.complete(transaction, attempt.recordId, 201, result);
      return result;
    });
  }

  async decideCancellation(
    access: AccessContext,
    requestId: string,
    decision: 'APPROVED' | 'REJECTED',
    decisionReason: string,
    meta: IdempotentMeta,
  ): Promise<CancellationRequestResult> {
    return this.prisma.serializable(async (transaction) => {
      const attempt = await this.idempotency.begin<CancellationRequestResult>(
        transaction,
        access.organizationId,
        `enrollment.cancellation.${decision.toLowerCase()}`,
        meta.idempotencyKey,
        { requestId, decision, decisionReason },
      );
      if (attempt.replayed) return attempt.response;
      await transaction.$queryRaw`SELECT id FROM enrollment_cancellation_requests WHERE id = ${requestId}::uuid AND organization_id = ${access.organizationId}::uuid FOR UPDATE`;
      const request = await transaction.enrollmentCancellationRequest.findFirst({
        where: { id: requestId, organizationId: access.organizationId },
      });
      if (!request) {
        throw new NotFoundException({
          code: 'CANCELLATION_REQUEST_NOT_FOUND',
          messageKey: 'enrollments.cancellationRequestNotFound',
        });
      }
      if (request.status === decision) {
        const result = {
          id: request.id,
          enrollmentId: request.enrollmentId,
          status: decision,
        };
        await this.idempotency.complete(transaction, attempt.recordId, 200, result);
        return result;
      }
      if (request.status !== 'REQUESTED') {
        throw new ConflictException({
          code: 'CANCELLATION_DECISION_INVALID',
          messageKey: 'enrollments.cancellationDecisionInvalid',
        });
      }
      if (request.requestedBy === access.actorUserId) {
        throw new ConflictException({
          code: 'MAKER_CHECKER_REQUIRED',
          messageKey: 'finance.makerCheckerRequired',
        });
      }
      await transaction.$queryRaw`SELECT id FROM enrollments WHERE id = ${request.enrollmentId}::uuid AND organization_id = ${access.organizationId}::uuid FOR UPDATE`;
      const enrollment = await this.queryService.findScoped(
        transaction,
        access,
        request.enrollmentId,
        'enrollments.cancel.approve',
      );
      if (decision === 'APPROVED' && enrollment.version !== request.enrollmentVersion) {
        throw new ConflictException({
          code: 'CANCELLATION_ENROLLMENT_CHANGED',
          messageKey: 'enrollments.cancellationEnrollmentChanged',
        });
      }
      const now = new Date();
      if (decision === 'APPROVED') {
        nextState(enrollment.state, 'cancel');
        await transaction.enrollment.update({
          where: { id: enrollment.id },
          data: {
            state: 'CANCELLED',
            cancelledAt: now,
            version: { increment: 1 },
          },
        });
        await transaction.enrollmentCohortAssignment.updateMany({
          where: {
            organizationId: access.organizationId,
            enrollmentId: enrollment.id,
            endsAt: null,
          },
          data: { endsAt: now },
        });
        await this.eventService.record(
          transaction,
          access,
          enrollment.id,
          'cancel',
          enrollment.state,
          'CANCELLED',
          {
            correlationId: meta.correlationId,
            expectedVersion: enrollment.version,
            reason: `${request.reason}\nDecision: ${decisionReason}`,
          },
          { cancellationRequestId: request.id, refundCreated: false },
        );
      } else {
        await this.audit.write(transaction, {
          organizationId: access.organizationId,
          actorUserId: access.actorUserId,
          action: 'enrollment.cancellation.reject',
          entityType: 'EnrollmentCancellationRequest',
          entityId: request.id,
          correlationId: meta.correlationId,
          after: {
            decisionReason,
            requestedEnrollmentVersion: request.enrollmentVersion,
            currentEnrollmentVersion: enrollment.version,
          },
        });
        await this.outbox.add(transaction, {
          organizationId: access.organizationId,
          aggregateType: 'EnrollmentCancellationRequest',
          aggregateId: request.id,
          type: 'enrollment.cancellation.rejected',
          payload: { requestId: request.id, enrollmentId: request.enrollmentId },
        });
      }
      const updated = await transaction.enrollmentCancellationRequest.update({
        where: { id: request.id },
        data: {
          status: decision,
          decidedBy: access.actorUserId,
          decisionReason,
          decidedAt: now,
        },
      });
      const result = {
        id: updated.id,
        enrollmentId: updated.enrollmentId,
        status: updated.status,
      };
      await this.idempotency.complete(transaction, attempt.recordId, 200, result);
      return result;
    });
  }
}
