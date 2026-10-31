import { Injectable } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { FinanceAccessService } from '../finance-access.service';
import { AuditService } from '../../platform/audit/audit.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { PrismaService } from '../../platform/database/prisma.service';
import { IdempotencyService } from '../../platform/idempotency/idempotency.service';
import { PricingHelperService, type PricingResult } from './pricing-helper.service';

@Injectable()
export class PricingApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financeAccess: FinanceAccessService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly idempotency: IdempotencyService,
    private readonly helper: PricingHelperService,
  ) {}

  async approve(
    access: AccessContext,
    agreementId: string,
    reason: string,
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
      const approvalPermission = this.helper.requiredApprovalPermission(agreement);
      const enrollment = await this.financeAccess.assertEnrollment(
        transaction,
        access,
        approvalPermission,
        agreement.enrollmentId,
      );
      const attempt = await this.idempotency.begin<PricingResult>(
        transaction,
        access.organizationId,
        'pricing.approve',
        idempotencyKey,
        { agreementId, expectedVersion, reason },
      );
      if (attempt.replayed) return attempt.response;
      if (agreement.status === 'APPROVED') {
        const result = this.helper.pricingResult(agreement);
        await this.idempotency.complete(transaction, attempt.recordId, 200, result);
        return result;
      }
      if (agreement.status !== 'PROPOSED' || agreement.lockVersion !== expectedVersion) {
        throw this.helper.pricingConflict();
      }
      this.helper.assertEnrollmentCanBePriced(enrollment.state);
      const previousApproved = await transaction.pricingAgreement.findFirst({
        where: {
          organizationId: access.organizationId,
          enrollmentId: agreement.enrollmentId,
          status: 'APPROVED',
          id: { not: agreement.id },
        },
      });
      if (previousApproved) {
        await transaction.pricingAgreement.update({
          where: { id: previousApproved.id },
          data: { status: 'SUPERSEDED', lockVersion: { increment: 1 } },
        });
      }
      const updated = await transaction.pricingAgreement.update({
        where: { id: agreement.id },
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
        action: 'pricing.approve',
        entityType: 'PricingAgreement',
        entityId: agreement.id,
        correlationId,
        after: {
          reason,
          requiredPermission: approvalPermission,
          ...this.helper.pricingResult(updated),
        },
      });
      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'PricingAgreement',
        aggregateId: agreement.id,
        type: 'pricing.approved',
        payload: { pricingAgreementId: agreement.id, enrollmentId: agreement.enrollmentId },
      });
      const result = this.helper.pricingResult(updated);
      await this.idempotency.complete(transaction, attempt.recordId, 200, result);
      return result;
    });
  }
}
