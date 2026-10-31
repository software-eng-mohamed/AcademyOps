import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { AuditService } from '../platform/audit/audit.service';
import { PrismaService } from '../platform/database/prisma.service';
import { IdempotencyService } from '../platform/idempotency/idempotency.service';
import { FinanceAccessService } from './finance-access.service';
import { FinanceHelperService } from './finance-helper.service';
import { assertNoPendingReversal, settlePaymentAdjustment } from './finance-payment-adjustment';

type MutationMeta = { correlationId: string; idempotencyKey: string };
type RequestResult = { id: string; status: string };
type RefundResult = { id: string; amount: string };

@Injectable()
export class FinanceRefundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly idempotency: IdempotencyService,
    private readonly financeAccess: FinanceAccessService,
    private readonly helper: FinanceHelperService,
  ) {}

  async requestRefund(
    access: AccessContext,
    paymentId: string,
    amount: string,
    reason: string,
    meta: MutationMeta,
  ): Promise<RequestResult> {
    return this.prisma.serializable(async (transaction) => {
      await this.helper.lockPayment(transaction, access.organizationId, paymentId);
      const payment = await transaction.payment.findFirst({
        where: { id: paymentId, organizationId: access.organizationId, status: 'POSTED' },
      });
      if (!payment) throw this.helper.paymentNotFound();
      await this.financeAccess.assertBillingAccount(
        transaction,
        access,
        'refunds.request',
        payment.billingAccountId,
        payment.enrollmentId,
      );
      const attempt = await this.idempotency.begin<RequestResult>(
        transaction,
        access.organizationId,
        'refund.request',
        meta.idempotencyKey,
        { paymentId, amount, reason },
      );
      if (attempt.replayed) return attempt.response;
      await assertNoPendingReversal(transaction, access.organizationId, paymentId);
      const requestedAmount = new Prisma.Decimal(amount);
      if (requestedAmount.lte(0)) throw this.refundAmountInvalid();
      const [processed, pending] = await Promise.all([
        transaction.refund.aggregate({
          where: { organizationId: access.organizationId, paymentId },
          _sum: { amount: true },
        }),
        transaction.refundRequest.aggregate({
          where: { organizationId: access.organizationId, paymentId, status: 'REQUESTED' },
          _sum: { requestedAmount: true },
        }),
      ]);
      const reserved = (processed._sum.amount ?? new Prisma.Decimal(0)).add(
        pending._sum.requestedAmount ?? new Prisma.Decimal(0),
      );
      if (reserved.add(requestedAmount).gt(payment.amount)) {
        throw this.refundAmountExceedsAvailable();
      }
      const request = await transaction.refundRequest.create({
        data: {
          organizationId: access.organizationId,
          paymentId,
          requestedAmount,
          reason,
          requestedBy: access.actorUserId,
        },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'refund.request',
        entityType: 'RefundRequest',
        entityId: request.id,
        correlationId: meta.correlationId,
      });
      const result = { id: request.id, status: request.status };
      await this.idempotency.complete(transaction, attempt.recordId, 201, result);
      return result;
    });
  }

  async approveRefund(
    access: AccessContext,
    requestId: string,
    meta: MutationMeta,
  ): Promise<RefundResult> {
    return this.prisma.serializable(async (transaction) => {
      const scopedRequest = await transaction.refundRequest.findFirst({
        where: { id: requestId, organizationId: access.organizationId },
      });
      if (!scopedRequest)
        throw new NotFoundException({
          code: 'REFUND_REQUEST_NOT_FOUND',
          messageKey: 'finance.refundRequestNotFound',
        });
      if (scopedRequest.requestedBy === access.actorUserId) {
        throw new ConflictException({
          code: 'MAKER_CHECKER_REQUIRED',
          messageKey: 'finance.makerCheckerRequired',
        });
      }
      const scopedPayment = await transaction.payment.findFirst({
        where: { id: scopedRequest.paymentId, organizationId: access.organizationId },
      });
      if (!scopedPayment) throw this.helper.paymentNotFound();
      await this.financeAccess.assertBillingAccount(
        transaction,
        access,
        'refunds.approve',
        scopedPayment.billingAccountId,
        scopedPayment.enrollmentId,
      );
      const attempt = await this.idempotency.begin<RefundResult>(
        transaction,
        access.organizationId,
        'refund.approve',
        meta.idempotencyKey,
        { requestId },
      );
      if (attempt.replayed) return attempt.response;
      await this.helper.lockPayment(transaction, access.organizationId, scopedRequest.paymentId);
      await transaction.$queryRaw`SELECT id FROM refund_requests WHERE id = ${requestId}::uuid AND organization_id = ${access.organizationId}::uuid FOR UPDATE`;
      const request = await transaction.refundRequest.findFirst({
        where: { id: requestId, organizationId: access.organizationId },
      });
      if (!request)
        throw new NotFoundException({
          code: 'REFUND_REQUEST_NOT_FOUND',
          messageKey: 'finance.refundRequestNotFound',
        });
      if (request.requestedBy === access.actorUserId) {
        throw new ConflictException({
          code: 'MAKER_CHECKER_REQUIRED',
          messageKey: 'finance.makerCheckerRequired',
        });
      }
      if (!['REQUESTED', 'APPROVED'].includes(request.status)) {
        throw new ConflictException({
          code: 'FINANCIAL_REQUEST_ALREADY_DECIDED',
          messageKey: 'finance.financialRequestAlreadyDecided',
        });
      }
      const existing = await transaction.refund.findFirst({
        where: { organizationId: access.organizationId, refundRequestId: request.id },
      });
      if (existing) {
        const result = { id: existing.id, amount: existing.amount.toFixed(2) };
        await this.idempotency.complete(transaction, attempt.recordId, 200, result);
        return result;
      }
      if (request.status !== 'REQUESTED') {
        throw new ConflictException({
          code: 'FINANCIAL_REQUEST_ALREADY_DECIDED',
          messageKey: 'finance.financialRequestAlreadyDecided',
        });
      }
      const payment = await transaction.payment.findFirstOrThrow({
        where: { id: request.paymentId, organizationId: access.organizationId },
      });
      await this.financeAccess.assertBillingAccount(
        transaction,
        access,
        'refunds.approve',
        payment.billingAccountId,
        payment.enrollmentId,
      );
      if (payment.status !== 'POSTED' || !payment.ledgerEntryId)
        throw new ConflictException({
          code: 'REFUND_INVALID_PAYMENT',
          messageKey: 'finance.refundInvalidPayment',
        });
      await assertNoPendingReversal(transaction, access.organizationId, payment.id);
      const processed = await transaction.refund.aggregate({
        where: { organizationId: access.organizationId, paymentId: payment.id },
        _sum: { amount: true },
      });
      if (
        (processed._sum.amount ?? new Prisma.Decimal(0))
          .add(request.requestedAmount)
          .gt(payment.amount)
      ) {
        throw this.refundAmountExceedsAvailable();
      }
      const entry = await transaction.ledgerEntry.create({
        data: {
          organizationId: access.organizationId,
          billingAccountId: payment.billingAccountId,
          enrollmentId: payment.enrollmentId,
          direction: 'DEBIT',
          entryType: 'REFUND',
          amount: request.requestedAmount,
          sourceType: 'REFUND_REQUEST',
          sourceId: request.id,
          description: request.reason,
        },
      });
      const refund = await transaction.refund.create({
        data: {
          organizationId: access.organizationId,
          refundRequestId: request.id,
          paymentId: payment.id,
          ledgerEntryId: entry.id,
          amount: request.requestedAmount,
          processedBy: access.actorUserId,
        },
      });
      await settlePaymentAdjustment(transaction, access, payment.ledgerEntryId, entry);
      await transaction.refundRequest.update({
        where: { id: request.id },
        data: {
          status: 'APPROVED',
          approvedBy: access.actorUserId,
          decidedBy: access.actorUserId,
          decisionReason: request.reason,
          decidedAt: new Date(),
        },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'refund.approve',
        entityType: 'Refund',
        entityId: refund.id,
        correlationId: meta.correlationId,
      });
      const result = { id: refund.id, amount: refund.amount.toFixed(2) };
      await this.idempotency.complete(transaction, attempt.recordId, 200, result);
      return result;
    });
  }

  private refundAmountInvalid(): ConflictException {
    return new ConflictException({
      code: 'REFUND_AMOUNT_INVALID',
      messageKey: 'finance.refundAmountInvalid',
    });
  }

  private refundAmountExceedsAvailable(): ConflictException {
    return new ConflictException({
      code: 'REFUND_AMOUNT_EXCEEDS_AVAILABLE',
      messageKey: 'finance.refundAmountExceedsAvailable',
    });
  }
}
