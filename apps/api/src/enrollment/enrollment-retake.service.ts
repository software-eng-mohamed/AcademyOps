import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { PrismaService } from '../platform/database/prisma.service';
import { AuditService } from '../platform/audit/audit.service';
import { OutboxService } from '../platform/outbox/outbox.service';
import { EnrollmentQueryService } from './enrollment-query.service';
import type { CreateModuleRetakeDto } from './enrollment.dto';
import { versionConflict } from './enrollment-common';

@Injectable()
export class EnrollmentRetakeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly queryService: EnrollmentQueryService,
  ) {}

  async requestRetake(
    access: AccessContext,
    enrollmentId: string,
    input: CreateModuleRetakeDto,
    correlationId: string,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const enrollment = await this.queryService.findScoped(
        transaction,
        access,
        enrollmentId,
        'enrollments.retake',
      );
      if (!['ACTIVE', 'POSTPONED', 'COMPLETED'].includes(enrollment.state)) {
        throw new ConflictException({
          code: 'RETAKE_ENROLLMENT_STATE_INVALID',
          messageKey: 'enrollments.retakeStateInvalid',
        });
      }
      await this.validateRetakeLinks(transaction, access.organizationId, enrollment, input);
      const existing = await transaction.moduleRetake.findFirst({
        where: {
          organizationId: access.organizationId,
          enrollmentId,
          programVersionModuleId: input.programVersionModuleId,
          status: 'REQUESTED',
        },
      });
      if (existing) {
        throw new ConflictException({
          code: 'RETAKE_REQUEST_EXISTS',
          messageKey: 'enrollments.retakeRequestExists',
        });
      }
      const retake = await transaction.moduleRetake.create({
        data: {
          organizationId: access.organizationId,
          enrollmentId,
          programVersionModuleId: input.programVersionModuleId,
          targetCohortModuleId: input.targetCohortModuleId ?? null,
          reason: input.reason,
          requestedBy: access.actorUserId,
        },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'enrollment.retake.request',
        entityType: 'ModuleRetake',
        entityId: retake.id,
        correlationId,
        after: {
          enrollmentId,
          programVersionModuleId: input.programVersionModuleId,
          targetCohortModuleId: input.targetCohortModuleId ?? null,
        },
      });
      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'ModuleRetake',
        aggregateId: retake.id,
        type: 'enrollment.retake.requested',
        payload: { retakeId: retake.id, enrollmentId },
      });
      return retake;
    });
  }

  async decideRetake(
    access: AccessContext,
    retakeId: string,
    decision: 'APPROVED' | 'REJECTED',
    reason: string,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.prisma.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM module_retakes WHERE id = ${retakeId}::uuid AND organization_id = ${access.organizationId}::uuid FOR UPDATE`;
      const retake = await transaction.moduleRetake.findFirst({
        where: { organizationId: access.organizationId, id: retakeId },
      });
      if (!retake) {
        throw new NotFoundException({
          code: 'RETAKE_NOT_FOUND',
          messageKey: 'enrollments.retakeNotFound',
        });
      }
      await this.queryService.findScoped(
        transaction,
        access,
        retake.enrollmentId,
        'enrollments.retake',
      );
      if (retake.version !== expectedVersion) throw versionConflict();
      if (retake.status !== 'REQUESTED') {
        throw new ConflictException({
          code: 'RETAKE_DECISION_INVALID',
          messageKey: 'enrollments.retakeDecisionInvalid',
        });
      }
      const updated = await transaction.moduleRetake.update({
        where: { id: retake.id },
        data: {
          status: decision,
          decidedBy: access.actorUserId,
          decidedAt: new Date(),
          reason: `${retake.reason ?? ''}\nDecision: ${reason}`.trim(),
          version: { increment: 1 },
        },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: `enrollment.retake.${decision.toLowerCase()}`,
        entityType: 'ModuleRetake',
        entityId: retake.id,
        correlationId,
        before: { status: retake.status, version: retake.version },
        after: { status: updated.status, version: updated.version, reason },
      });
      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'ModuleRetake',
        aggregateId: retake.id,
        type: `enrollment.retake.${decision.toLowerCase()}`,
        payload: { retakeId: retake.id, enrollmentId: retake.enrollmentId },
      });
      return updated;
    });
  }

  private async validateRetakeLinks(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    enrollment: { programVersionId: string },
    input: CreateModuleRetakeDto,
  ) {
    const versionModule = await transaction.programVersionModule.findFirst({
      where: {
        organizationId,
        id: input.programVersionModuleId,
        programVersionId: enrollment.programVersionId,
      },
    });
    if (!versionModule) {
      throw new ConflictException({
        code: 'RETAKE_MODULE_INVALID',
        messageKey: 'enrollments.retakeModuleInvalid',
      });
    }
    if (input.targetCohortModuleId) {
      const target = await transaction.cohortModule.findFirst({
        where: {
          organizationId,
          id: input.targetCohortModuleId,
          programVersionModuleId: versionModule.id,
        },
      });
      if (!target) {
        throw new ConflictException({
          code: 'RETAKE_TARGET_INVALID',
          messageKey: 'enrollments.retakeTargetInvalid',
        });
      }
    }
  }
}
