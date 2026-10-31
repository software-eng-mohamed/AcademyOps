import { Injectable } from '@nestjs/common';
import type { AccessContext, PermissionCode } from '@academyops/contracts';
import { FinanceAccessService } from '../finance-access.service';
import { AuditService } from '../../platform/audit/audit.service';
import { PrismaService } from '../../platform/database/prisma.service';
import { IdempotencyService } from '../../platform/idempotency/idempotency.service';
import { PricingHelperService, type PricingResult } from './pricing-helper.service';
import type { CreatePricingAgreementDto, UpdatePricingAgreementDto } from './pricing.dto';

@Injectable()
export class PricingAgreementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financeAccess: FinanceAccessService,
    private readonly audit: AuditService,
    private readonly idempotency: IdempotencyService,
    private readonly helper: PricingHelperService,
  ) {}

  async create(
    access: AccessContext,
    input: CreatePricingAgreementDto,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<PricingResult> {
    return this.prisma.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM enrollments WHERE id = ${input.enrollmentId}::uuid AND organization_id = ${access.organizationId}::uuid FOR UPDATE`;
      const enrollment = await this.financeAccess.assertEnrollment(
        transaction,
        access,
        'pricing.propose',
        input.enrollmentId,
      );
      const attempt = await this.idempotency.begin<PricingResult>(
        transaction,
        access.organizationId,
        'pricing.create',
        idempotencyKey,
        input,
      );
      if (attempt.replayed) return attempt.response;
      this.helper.assertEnrollmentCanBePriced(enrollment.state);
      await transaction.$queryRaw<Array<{ locked: string }>>`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`${access.organizationId}:pricing:${input.enrollmentId}`}, 0)
        )::text AS locked
      `;
      const previous = await transaction.pricingAgreement.aggregate({
        where: { organizationId: access.organizationId, enrollmentId: input.enrollmentId },
        _max: { version: true },
      });
      const calculated = this.helper.prepareLines(input.lines, input.discountAmount);
      const agreement = await transaction.pricingAgreement.create({
        data: {
          organizationId: access.organizationId,
          enrollmentId: input.enrollmentId,
          version: (previous._max.version ?? 0) + 1,
          subtotal: calculated.subtotal,
          discountAmount: calculated.discount,
          totalAmount: calculated.total,
          proposedBy: access.actorUserId,
        },
      });
      await this.helper.writeLines(
        transaction,
        access.organizationId,
        agreement.id,
        calculated.lines,
      );
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'pricing.create',
        entityType: 'PricingAgreement',
        entityId: agreement.id,
        correlationId,
        after: this.helper.pricingResult(agreement),
      });
      const result = this.helper.pricingResult(agreement);
      await this.idempotency.complete(transaction, attempt.recordId, 201, result);
      return result;
    });
  }

  async update(
    access: AccessContext,
    agreementId: string,
    input: UpdatePricingAgreementDto,
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<PricingResult> {
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
      const attempt = await this.idempotency.begin<PricingResult>(
        transaction,
        access.organizationId,
        'pricing.update',
        idempotencyKey,
        { agreementId, expectedVersion, input },
      );
      if (attempt.replayed) return attempt.response;
      if (agreement.status !== 'DRAFT' || agreement.lockVersion !== expectedVersion) {
        throw this.helper.pricingConflict();
      }
      this.helper.assertEnrollmentCanBePriced(enrollment.state);
      const calculated = this.helper.prepareLines(input.lines, input.discountAmount);
      await transaction.pricingAgreementLine.deleteMany({
        where: { organizationId: access.organizationId, pricingAgreementId: agreement.id },
      });
      await this.helper.writeLines(
        transaction,
        access.organizationId,
        agreement.id,
        calculated.lines,
      );
      const updated = await transaction.pricingAgreement.update({
        where: { id: agreement.id },
        data: {
          subtotal: calculated.subtotal,
          discountAmount: calculated.discount,
          totalAmount: calculated.total,
          lockVersion: { increment: 1 },
        },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'pricing.update',
        entityType: 'PricingAgreement',
        entityId: agreement.id,
        correlationId,
        before: this.helper.pricingResult(agreement),
        after: this.helper.pricingResult(updated),
      });
      const result = this.helper.pricingResult(updated);
      await this.idempotency.complete(transaction, attempt.recordId, 200, result);
      return result;
    });
  }

  async submit(
    access: AccessContext,
    agreementId: string,
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<PricingResult> {
    return this.changeAgreementState(
      access,
      agreementId,
      expectedVersion,
      idempotencyKey,
      correlationId,
      'pricing.propose',
      'DRAFT',
      'PROPOSED',
      'pricing.submit',
    );
  }

  async reject(
    access: AccessContext,
    agreementId: string,
    reason: string,
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<PricingResult> {
    return this.changeAgreementState(
      access,
      agreementId,
      expectedVersion,
      idempotencyKey,
      correlationId,
      'discounts.approve_tier1',
      'PROPOSED',
      'REJECTED',
      'pricing.reject',
      reason,
    );
  }

  async changeAgreementState(
    access: AccessContext,
    agreementId: string,
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string,
    permission: PermissionCode,
    fromStatus: string,
    toStatus: string,
    operation: string,
    reason?: string,
  ): Promise<PricingResult> {
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
        permission,
        agreement.enrollmentId,
      );
      const attempt = await this.idempotency.begin<PricingResult>(
        transaction,
        access.organizationId,
        operation,
        idempotencyKey,
        { agreementId, expectedVersion, reason },
      );
      if (attempt.replayed) return attempt.response;
      if (agreement.status === toStatus) {
        const result = this.helper.pricingResult(agreement);
        await this.idempotency.complete(transaction, attempt.recordId, 200, result);
        return result;
      }
      if (agreement.status !== fromStatus || agreement.lockVersion !== expectedVersion) {
        throw this.helper.pricingConflict();
      }
      if (toStatus === 'PROPOSED') this.helper.assertEnrollmentCanBePriced(enrollment.state);
      const updated = await transaction.pricingAgreement.update({
        where: { id: agreement.id },
        data: { status: toStatus, lockVersion: { increment: 1 } },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: operation,
        entityType: 'PricingAgreement',
        entityId: agreement.id,
        correlationId,
        before: { status: agreement.status, lockVersion: agreement.lockVersion },
        after: { status: updated.status, lockVersion: updated.lockVersion, reason: reason ?? null },
      });
      const result = this.helper.pricingResult(updated);
      await this.idempotency.complete(transaction, attempt.recordId, 200, result);
      return result;
    });
  }
}
