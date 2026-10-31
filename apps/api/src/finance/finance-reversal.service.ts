import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { AuditService } from '../platform/audit/audit.service';
import { PrismaService } from '../platform/database/prisma.service';
import { IdempotencyService } from '../platform/idempotency/idempotency.service';
import { FinanceAccessService } from './finance-access.service';
import { FinanceHelperService } from './finance-helper.service';
import { assertNoRefundForReversal, settlePaymentAdjustment } from './finance-payment-adjustment';

type MutationMeta = { correlationId: string; idempotencyKey: string };
type RequestResult = { id: string; status: string };
type PaymentResult = { id: string; status: string; version: number; receiptSerial: string | null };

@Injectable()
export class FinanceReversalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly idempotency: IdempotencyService,
    private readonly financeAccess: FinanceAccessService,
    private readonly helper: FinanceHelperService,
  ) {}

  async requestReversal(
    access: AccessContext,
    paymentId: string,
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
        'payments.reverse.request',
        payment.billingAccountId,
        payment.enrollmentId,
      );
      const attempt = await this.idempotency.begin<RequestResult>(
        transaction,
        access.organizationId,
        'payment.reversal.request',
        meta.idempotencyKey,
        { paymentId, reason },
      );
      if (attempt.replayed) return attempt.response;
      await assertNoRefundForReversal(transaction, access.organizationId, paymentId);
      const request = await transaction.paymentReversalRequest.create({
        data: {
          organizationId: access.organizationId,
          paymentId,
          reason,
          requestedBy: access.actorUserId,
        },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'payment.reversal.request',
        entityType: 'PaymentReversalRequest',
        entityId: request.id,
        correlationId: meta.correlationId,
      });
      const result = { id: request.id, status: request.status };
      await this.idempotency.complete(transaction, attempt.recordId, 201, result);
      return result;
    });
  }

  async approveReversal(
    access: AccessContext,
    requestId: string,
    meta: MutationMeta,
  ): Promise<PaymentResult> {
    return this.prisma.serializable(async (transaction) => {
      const scopedRequest = await transaction.paymentReversalRequest.findFirst({
        where: { id: requestId, organizationId: access.organizationId },
      });
      if (!scopedRequest)
        throw new NotFoundException({
          code: 'REVERSAL_REQUEST_NOT_FOUND',
          messageKey: 'finance.reversalRequestNotFound',
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
        'payments.reverse.approve',
        scopedPayment.billingAccountId,
        scopedPayment.enrollmentId,
      );
      const attempt = await this.idempotency.begin<PaymentResult>(
        transaction,
        access.organizationId,
        'payment.reversal.approve',
        meta.idempotencyKey,
        { requestId },
      );
      if (attempt.replayed) return attempt.response;
      await this.helper.lockPayment(transaction, access.organizationId, scopedRequest.paymentId);
      await transaction.$queryRaw`SELECT id FROM payment_reversal_requests WHERE id = ${requestId}::uuid AND organization_id = ${access.organizationId}::uuid FOR UPDATE`;
      const request = await transaction.paymentReversalRequest.findFirst({
        where: { id: requestId, organizationId: access.organizationId },
      });
      if (!request)
        throw new NotFoundException({
          code: 'REVERSAL_REQUEST_NOT_FOUND',
          messageKey: 'finance.reversalRequestNotFound',
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
      const payment = await transaction.payment.findFirstOrThrow({
        where: { id: request.paymentId, organizationId: access.organizationId },
      });
      await this.financeAccess.assertBillingAccount(
        transaction,
        access,
        'payments.reverse.approve',
        payment.billingAccountId,
        payment.enrollmentId,
      );
      if (payment.status === 'REVERSED' && request.status === 'APPROVED') {
        const result = await this.helper.paymentResult(transaction, payment.id);
        await this.idempotency.complete(transaction, attempt.recordId, 200, result);
        return result;
      }
      if (request.status !== 'REQUESTED') {
        throw new ConflictException({
          code: 'FINANCIAL_REQUEST_ALREADY_DECIDED',
          messageKey: 'finance.financialRequestAlreadyDecided',
        });
      }
      if (payment.status !== 'POSTED' || !payment.ledgerEntryId) {
        throw new ConflictException({
          code: 'PAYMENT_REVERSE_INVALID',
          messageKey: 'finance.paymentReverseInvalid',
        });
      }
      await assertNoRefundForReversal(transaction, access.organizationId, payment.id);
      const adjustment = await transaction.ledgerEntry.create({
        data: {
          organizationId: access.organizationId,
          billingAccountId: payment.billingAccountId,
          enrollmentId: payment.enrollmentId,
          direction: 'DEBIT',
          entryType: 'PAYMENT_REVERSAL',
          amount: payment.amount,
          reversalOfId: payment.ledgerEntryId,
          sourceType: 'PAYMENT_REVERSAL_REQUEST',
          sourceId: request.id,
          description: request.reason,
        },
      });
      await settlePaymentAdjustment(transaction, access, payment.ledgerEntryId, adjustment);
      await transaction.payment.update({
        where: { id: payment.id },
        data: { status: 'REVERSED', version: { increment: 1 } },
      });
      await transaction.paymentEvent.create({
        data: {
          organizationId: access.organizationId,
          paymentId: payment.id,
          fromStatus: payment.status,
          toStatus: 'REVERSED',
          reason: request.reason,
          actorUserId: access.actorUserId,
        },
      });
      await transaction.paymentReversalRequest.update({
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
        action: 'payment.reverse',
        entityType: 'Payment',
        entityId: payment.id,
        correlationId: meta.correlationId,
      });
      const result = await this.helper.paymentResult(transaction, payment.id);
      await this.idempotency.complete(transaction, attempt.recordId, 200, result);
      return result;
    });
  }
}
