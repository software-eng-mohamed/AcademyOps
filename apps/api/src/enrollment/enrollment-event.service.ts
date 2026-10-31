import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { AuditService } from '../platform/audit/audit.service';
import { OutboxService } from '../platform/outbox/outbox.service';

export type MutationMeta = {
  correlationId: string;
  expectedVersion: number;
  reason?: string;
};

@Injectable()
export class EnrollmentEventService {
  constructor(
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async record(
    transaction: Prisma.TransactionClient,
    access: AccessContext,
    enrollmentId: string,
    command: string,
    fromState: string | null,
    toState: string,
    meta: MutationMeta,
    data?: Prisma.InputJsonValue,
  ): Promise<void> {
    await transaction.enrollmentEvent.create({
      data: {
        organizationId: access.organizationId,
        enrollmentId,
        type: command.toUpperCase(),
        fromState,
        toState,
        reason: meta.reason ?? null,
        actorUserId: access.actorUserId,
        ...(data === undefined ? {} : { data }),
      },
    });
    await this.audit.write(transaction, {
      organizationId: access.organizationId,
      actorUserId: access.actorUserId,
      action: `enrollment.${command}`,
      entityType: 'Enrollment',
      entityId: enrollmentId,
      correlationId: meta.correlationId,
      before: { state: fromState, version: meta.expectedVersion },
      after: {
        state: toState,
        version: meta.expectedVersion + 1,
        ...(data && typeof data === 'object' ? data : {}),
      },
    });
    await this.outbox.add(transaction, {
      organizationId: access.organizationId,
      aggregateType: 'Enrollment',
      aggregateId: enrollmentId,
      type: `enrollment.${command}`,
      payload: { enrollmentId, fromState, toState },
    });
  }
}
