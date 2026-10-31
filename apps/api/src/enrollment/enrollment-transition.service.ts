import { ConflictException, Injectable } from '@nestjs/common';
import type { AccessContext, EnrollmentCommand, EnrollmentState } from '@academyops/contracts';
import { PrismaService } from '../platform/database/prisma.service';
import { EnrollmentQueryService } from './enrollment-query.service';
import { EnrollmentEventService } from './enrollment-event.service';
import type { MutationMeta } from './enrollment-event.service';
import { nextState, permissionForCommand, versionConflict } from './enrollment-common';
import { settleEnrollmentPrepayments } from '../finance/finance-allocation-settlement';

@Injectable()
export class EnrollmentTransitionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryService: EnrollmentQueryService,
    private readonly eventService: EnrollmentEventService,
  ) {}

  async transition(
    access: AccessContext,
    enrollmentId: string,
    command: Exclude<EnrollmentCommand, 'activate'>,
    meta: MutationMeta,
  ): Promise<{ id: string; state: EnrollmentState; version: number }> {
    return this.prisma.$transaction(async (transaction) => {
      const enrollment = await this.queryService.findScoped(
        transaction,
        access,
        enrollmentId,
        permissionForCommand(command),
      );
      const next = nextState(enrollment.state, command);
      const updated = await transaction.enrollment.updateMany({
        where: {
          id: enrollment.id,
          organizationId: access.organizationId,
          version: meta.expectedVersion,
        },
        data: {
          state: next,
          version: { increment: 1 },
          ...(next === 'COMPLETED' ? { completedAt: new Date() } : {}),
          ...(next === 'CANCELLED' ? { cancelledAt: new Date() } : {}),
        },
      });
      if (updated.count !== 1) throw versionConflict();
      if (['COMPLETED', 'CANCELLED'].includes(next)) {
        await transaction.enrollmentCohortAssignment.updateMany({
          where: {
            organizationId: access.organizationId,
            enrollmentId: enrollment.id,
            endsAt: null,
          },
          data: { endsAt: new Date() },
        });
      }
      await this.eventService.record(
        transaction,
        access,
        enrollment.id,
        command,
        enrollment.state,
        next,
        meta,
      );
      return {
        id: enrollment.id,
        state: next,
        version: enrollment.version + 1,
      };
    });
  }

  async activate(
    access: AccessContext,
    enrollmentId: string,
    meta: MutationMeta,
  ): Promise<{ id: string; state: 'ACTIVE'; version: number }> {
    return this.prisma.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM enrollments WHERE id = ${enrollmentId}::uuid AND organization_id = ${access.organizationId}::uuid FOR UPDATE`;
      const enrollment = await this.queryService.findScoped(
        transaction,
        access,
        enrollmentId,
        'enrollments.activate',
      );
      nextState(enrollment.state, 'activate');
      if (enrollment.version !== meta.expectedVersion) throw versionConflict();

      const agreement = await transaction.pricingAgreement.findFirst({
        where: {
          organizationId: access.organizationId,
          enrollmentId,
          status: 'APPROVED',
        },
      });
      if (!agreement) {
        throw new ConflictException({
          code: 'PRICING_NOT_APPROVED',
          messageKey: 'enrollments.pricingNotApproved',
        });
      }
      const schedule = await transaction.installmentSchedule.findFirst({
        where: {
          organizationId: access.organizationId,
          enrollmentId,
          pricingAgreementId: agreement.id,
          status: 'APPROVED',
        },
      });
      if (!schedule) {
        throw new ConflictException({
          code: 'SCHEDULE_NOT_APPROVED',
          messageKey: 'enrollments.scheduleNotApproved',
        });
      }
      const assignment = await transaction.enrollmentCohortAssignment.findFirst({
        where: {
          organizationId: access.organizationId,
          enrollmentId,
          endsAt: null,
        },
      });
      if (!assignment) {
        throw new ConflictException({
          code: 'COHORT_REQUIRED',
          messageKey: 'enrollments.cohortRequired',
        });
      }
      const assignedCohort = await transaction.cohort.findFirst({
        where: {
          organizationId: access.organizationId,
          id: assignment.cohortId,
          programVersionId: enrollment.programVersionId,
          status: { in: ['PLANNED', 'ACTIVE'] },
        },
      });
      if (!assignedCohort) {
        throw new ConflictException({
          code: 'COHORT_ENROLLMENT_INVALID',
          messageKey: 'enrollments.cohortInvalid',
        });
      }
      const installments = await transaction.installment.findMany({
        where: {
          organizationId: access.organizationId,
          scheduleId: schedule.id,
        },
        orderBy: { ordinal: 'asc' },
      });
      if (installments.length === 0) {
        throw new ConflictException({
          code: 'INSTALLMENTS_REQUIRED',
          messageKey: 'enrollments.installmentsRequired',
        });
      }
      for (const installment of installments) {
        if (installment.debitEntryId) continue;
        const entry = await transaction.ledgerEntry.create({
          data: {
            organizationId: access.organizationId,
            billingAccountId: enrollment.billingAccountId,
            enrollmentId,
            direction: 'DEBIT',
            entryType: 'INSTALLMENT_DUE',
            amount: installment.amount,
            sourceType: 'INSTALLMENT',
            sourceId: installment.id,
            description: `Installment ${installment.ordinal}`,
          },
        });
        await transaction.installment.update({
          where: { id: installment.id },
          data: { debitEntryId: entry.id },
        });
      }
      await settleEnrollmentPrepayments(
        transaction,
        access,
        enrollment.billingAccountId,
        enrollmentId,
      );
      await transaction.enrollment.update({
        where: { id: enrollment.id },
        data: {
          state: 'ACTIVE',
          activatedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await this.eventService.record(
        transaction,
        access,
        enrollment.id,
        'activate',
        enrollment.state,
        'ACTIVE',
        meta,
      );
      return {
        id: enrollment.id,
        state: 'ACTIVE',
        version: enrollment.version + 1,
      };
    });
  }
}
