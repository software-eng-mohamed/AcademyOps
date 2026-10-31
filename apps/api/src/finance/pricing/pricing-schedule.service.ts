import { ConflictException, Injectable } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { FinanceAccessService } from '../finance-access.service';
import { AuditService } from '../../platform/audit/audit.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { PrismaService } from '../../platform/database/prisma.service';
import { IdempotencyService } from '../../platform/idempotency/idempotency.service';
import { PricingHelperService, type ScheduleResult } from './pricing-helper.service';
import type { CreateInstallmentScheduleDto, UpdateInstallmentScheduleDto } from './pricing.dto';

@Injectable()
export class PricingScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financeAccess: FinanceAccessService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly idempotency: IdempotencyService,
    private readonly helper: PricingHelperService,
  ) {}

  async createSchedule(
    access: AccessContext,
    agreementId: string,
    input: CreateInstallmentScheduleDto,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<ScheduleResult> {
    return this.prisma.serializable(async (transaction) => {
      await this.helper.lockAgreement(transaction, access.organizationId, agreementId);
      const agreement = await this.helper.findAgreement(
        transaction,
        access.organizationId,
        agreementId,
      );
      const enrollment = await this.financeAccess.assertEnrollment(
        transaction,
        access,
        'pricing.propose',
        agreement.enrollmentId,
      );
      if (agreement.status !== 'APPROVED') {
        throw new ConflictException({
          code: 'PRICING_NOT_APPROVED',
          messageKey: 'finance.pricingNotApproved',
        });
      }
      const attempt = await this.idempotency.begin<ScheduleResult>(
        transaction,
        access.organizationId,
        'installment_schedule.create',
        idempotencyKey,
        { agreementId, input },
      );
      if (attempt.replayed) return attempt.response;
      this.helper.assertEnrollmentCanBePriced(enrollment.state);
      const installments = this.helper.prepareInstallments(
        input.installments,
        agreement.totalAmount,
      );
      const previous = await transaction.installmentSchedule.aggregate({
        where: { organizationId: access.organizationId, pricingAgreementId: agreement.id },
        _max: { version: true },
      });
      const schedule = await transaction.installmentSchedule.create({
        data: {
          organizationId: access.organizationId,
          enrollmentId: agreement.enrollmentId,
          pricingAgreementId: agreement.id,
          version: (previous._max.version ?? 0) + 1,
        },
      });
      await this.helper.writeInstallments(
        transaction,
        access.organizationId,
        schedule.id,
        installments,
      );
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'installment_schedule.create',
        entityType: 'InstallmentSchedule',
        entityId: schedule.id,
        correlationId,
      });
      const result = this.helper.scheduleResult(schedule, agreement.totalAmount);
      await this.idempotency.complete(transaction, attempt.recordId, 201, result);
      return result;
    });
  }

  async updateSchedule(
    access: AccessContext,
    scheduleId: string,
    input: UpdateInstallmentScheduleDto,
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<ScheduleResult> {
    return this.prisma.serializable(async (transaction) => {
      await this.helper.lockSchedule(transaction, access.organizationId, scheduleId);
      const schedule = await this.helper.findSchedule(
        transaction,
        access.organizationId,
        scheduleId,
      );
      const agreement = await this.helper.findAgreement(
        transaction,
        access.organizationId,
        schedule.pricingAgreementId,
      );
      const enrollment = await this.financeAccess.assertEnrollment(
        transaction,
        access,
        'pricing.propose',
        schedule.enrollmentId,
      );
      const attempt = await this.idempotency.begin<ScheduleResult>(
        transaction,
        access.organizationId,
        'installment_schedule.update',
        idempotencyKey,
        { scheduleId, expectedVersion, input },
      );
      if (attempt.replayed) return attempt.response;
      if (schedule.status !== 'DRAFT' || schedule.lockVersion !== expectedVersion) {
        throw this.helper.scheduleConflict();
      }
      this.helper.assertEnrollmentCanBePriced(enrollment.state);
      const installments = this.helper.prepareInstallments(
        input.installments,
        agreement.totalAmount,
      );
      await transaction.installment.deleteMany({
        where: { organizationId: access.organizationId, scheduleId: schedule.id },
      });
      await this.helper.writeInstallments(
        transaction,
        access.organizationId,
        schedule.id,
        installments,
      );
      const updated = await transaction.installmentSchedule.update({
        where: { id: schedule.id },
        data: { lockVersion: { increment: 1 } },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'installment_schedule.update',
        entityType: 'InstallmentSchedule',
        entityId: schedule.id,
        correlationId,
      });
      const result = this.helper.scheduleResult(updated, agreement.totalAmount);
      await this.idempotency.complete(transaction, attempt.recordId, 200, result);
      return result;
    });
  }

  async approveSchedule(
    access: AccessContext,
    scheduleId: string,
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<ScheduleResult> {
    return this.prisma.serializable(async (transaction) => {
      await this.helper.lockSchedule(transaction, access.organizationId, scheduleId);
      const schedule = await this.helper.findSchedule(
        transaction,
        access.organizationId,
        scheduleId,
      );
      const agreement = await this.helper.findAgreement(
        transaction,
        access.organizationId,
        schedule.pricingAgreementId,
      );
      const enrollment = await this.financeAccess.assertEnrollment(
        transaction,
        access,
        'discounts.approve_tier1',
        schedule.enrollmentId,
      );
      const attempt = await this.idempotency.begin<ScheduleResult>(
        transaction,
        access.organizationId,
        'installment_schedule.approve',
        idempotencyKey,
        { scheduleId, expectedVersion },
      );
      if (attempt.replayed) return attempt.response;
      if (schedule.status === 'APPROVED') {
        const result = this.helper.scheduleResult(schedule, agreement.totalAmount);
        await this.idempotency.complete(transaction, attempt.recordId, 200, result);
        return result;
      }
      if (schedule.status !== 'DRAFT' || schedule.lockVersion !== expectedVersion) {
        throw this.helper.scheduleConflict();
      }
      this.helper.assertEnrollmentCanBePriced(enrollment.state);
      const updated = await transaction.installmentSchedule.update({
        where: { id: schedule.id },
        data: {
          status: 'APPROVED',
          approvedBy: access.actorUserId,
          approvedAt: new Date(),
          lockVersion: { increment: 1 },
        },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'installment_schedule.approve',
        entityType: 'InstallmentSchedule',
        entityId: schedule.id,
        correlationId,
      });
      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'InstallmentSchedule',
        aggregateId: schedule.id,
        type: 'installment_schedule.approved',
        payload: { scheduleId: schedule.id, enrollmentId: schedule.enrollmentId },
      });
      const result = this.helper.scheduleResult(updated, agreement.totalAmount);
      await this.idempotency.complete(transaction, attempt.recordId, 200, result);
      return result;
    });
  }
}
