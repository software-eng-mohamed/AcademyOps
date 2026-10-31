import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { PrismaService } from '../platform/database/prisma.service';
import { EnrollmentQueryService } from './enrollment-query.service';
import { EnrollmentEventService } from './enrollment-event.service';
import type { MutationMeta } from './enrollment-event.service';
import { assertCohortCapacity, versionConflict } from './enrollment-common';

@Injectable()
export class EnrollmentCohortService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryService: EnrollmentQueryService,
    private readonly eventService: EnrollmentEventService,
  ) {}

  async transfer(
    access: AccessContext,
    enrollmentId: string,
    targetCohortId: string,
    meta: MutationMeta,
  ): Promise<{ id: string; cohortId: string; version: number }> {
    return this.prisma.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM enrollments WHERE id = ${enrollmentId}::uuid AND organization_id = ${access.organizationId}::uuid FOR UPDATE`;
      const enrollment = await this.queryService.findScoped(
        transaction,
        access,
        enrollmentId,
        'enrollments.transfer',
      );
      if (!['ACTIVE', 'POSTPONED'].includes(enrollment.state)) {
        throw new ConflictException({
          code: 'TRANSFER_INVALID_STATE',
          messageKey: 'enrollments.transferInvalidState',
        });
      }
      if (enrollment.version !== meta.expectedVersion) throw versionConflict();
      const target = await transaction.cohort.findFirst({
        where: {
          id: targetCohortId,
          organizationId: access.organizationId,
          programVersionId: enrollment.programVersionId,
          status: { in: ['PLANNED', 'ACTIVE'] },
        },
      });
      if (!target) {
        throw new NotFoundException({
          code: 'COHORT_NOT_FOUND',
          messageKey: 'academic.cohortNotFound',
        });
      }
      const transferScopes = access.grants.get('enrollments.transfer');
      if (
        !transferScopes?.has('O') &&
        !(transferScopes?.has('B') && access.branchIds.has(target.owningBranchId))
      ) {
        throw new NotFoundException({
          code: 'COHORT_NOT_FOUND',
          messageKey: 'academic.cohortNotFound',
        });
      }
      const active = await transaction.enrollmentCohortAssignment.findFirst({
        where: {
          organizationId: access.organizationId,
          enrollmentId,
          endsAt: null,
        },
      });
      if (!active) {
        throw new ConflictException({
          code: 'ACTIVE_ASSIGNMENT_MISSING',
          messageKey: 'enrollments.activeAssignmentMissing',
        });
      }
      if (active.cohortId === target.id) {
        throw new ConflictException({
          code: 'ENROLLMENT_ALREADY_IN_COHORT',
          messageKey: 'enrollments.alreadyInCohort',
        });
      }
      await assertCohortCapacity(transaction, access.organizationId, target.id);
      const now = new Date();
      await transaction.enrollmentCohortAssignment.update({
        where: { id: active.id },
        data: { endsAt: now },
      });
      await transaction.enrollmentCohortAssignment.create({
        data: {
          organizationId: access.organizationId,
          enrollmentId,
          cohortId: targetCohortId,
          startsAt: now,
          reason: meta.reason ?? null,
          createdBy: access.actorUserId,
        },
      });
      await transaction.enrollment.update({
        where: { id: enrollment.id },
        data: { version: { increment: 1 } },
      });
      await this.eventService.record(
        transaction,
        access,
        enrollment.id,
        'transfer',
        enrollment.state,
        enrollment.state,
        meta,
        {
          fromCohortId: active.cohortId,
          toCohortId: targetCohortId,
        },
      );
      return {
        id: enrollment.id,
        cohortId: targetCohortId,
        version: enrollment.version + 1,
      };
    });
  }
}
