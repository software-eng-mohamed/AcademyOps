import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AccessContext, PermissionCode } from '@academyops/contracts';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../platform/audit/audit.service';
import { PrismaService } from '../platform/database/prisma.service';
import { IdempotencyService } from '../platform/idempotency/idempotency.service';
import { FinanceAccessService } from './finance-access.service';
import { FinanceHelperService } from './finance-helper.service';

type Kind = 'REFUND' | 'REVERSAL';
type Decision = 'REJECTED' | 'WITHDRAWN';
type Meta = { correlationId: string; idempotencyKey: string };
type DecisionResult = { id: string; status: string };

@Injectable()
export class FinanceRequestDecisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly idempotency: IdempotencyService,
    private readonly financeAccess: FinanceAccessService,
    private readonly helper: FinanceHelperService,
  ) {}

  async decide(
    access: AccessContext,
    kind: Kind,
    requestId: string,
    decision: Decision,
    reason: string,
    meta: Meta,
  ): Promise<DecisionResult> {
    reason = reason.trim();
    if (reason.length < 3 || reason.length > 1000) {
      throw new BadRequestException({
        code: 'FINANCIAL_REASON_INVALID',
        messageKey: 'finance.financialReasonInvalid',
      });
    }
    return this.prisma.serializable(async (transaction) => {
      const scoped = await this.read(transaction, access.organizationId, kind, requestId);
      if (!scoped) throw this.notFound(kind);
      const payment = await transaction.payment.findFirst({
        where: { id: scoped.paymentId, organizationId: access.organizationId },
      });
      if (!payment) throw this.helper.paymentNotFound();
      const permission: PermissionCode =
        kind === 'REFUND'
          ? decision === 'WITHDRAWN'
            ? 'refunds.request'
            : 'refunds.approve'
          : decision === 'WITHDRAWN'
            ? 'payments.reverse.request'
            : 'payments.reverse.approve';
      await this.financeAccess.assertBillingAccount(
        transaction,
        access,
        permission,
        payment.billingAccountId,
        payment.enrollmentId,
      );
      if (decision === 'WITHDRAWN' && scoped.requestedBy !== access.actorUserId) {
        throw new ForbiddenException({
          code: 'REQUEST_WITHDRAW_REQUESTER_REQUIRED',
          messageKey: 'finance.requestWithdrawRequesterRequired',
        });
      }
      if (decision === 'REJECTED' && scoped.requestedBy === access.actorUserId) {
        throw new ConflictException({
          code: 'MAKER_CHECKER_REQUIRED',
          messageKey: 'finance.makerCheckerRequired',
        });
      }
      await this.helper.lockPayment(transaction, access.organizationId, payment.id);
      if (kind === 'REFUND') {
        await transaction.$queryRaw`SELECT id FROM refund_requests WHERE id = ${requestId}::uuid AND organization_id = ${access.organizationId}::uuid FOR UPDATE`;
      } else {
        await transaction.$queryRaw`SELECT id FROM payment_reversal_requests WHERE id = ${requestId}::uuid AND organization_id = ${access.organizationId}::uuid FOR UPDATE`;
      }
      const operation = `${kind === 'REFUND' ? 'refund' : 'payment.reversal'}.${decision === 'WITHDRAWN' ? 'withdraw' : 'reject'}`;
      const attempt = await this.idempotency.begin<DecisionResult>(
        transaction,
        access.organizationId,
        operation,
        meta.idempotencyKey,
        { requestId, reason, actorUserId: access.actorUserId },
      );
      if (attempt.replayed) return attempt.response;
      const request = await this.read(transaction, access.organizationId, kind, requestId);
      if (!request) throw this.notFound(kind);
      const result = { id: request.id, status: decision };
      if (request.status !== 'REQUESTED') {
        if (
          request.status !== decision ||
          request.decidedBy !== access.actorUserId ||
          request.decisionReason !== reason
        ) {
          throw new ConflictException({
            code: 'FINANCIAL_REQUEST_ALREADY_DECIDED',
            messageKey: 'finance.financialRequestAlreadyDecided',
          });
        }
      } else {
        const data = {
          status: decision,
          decidedBy: access.actorUserId,
          decidedAt: new Date(),
          decisionReason: reason,
        };
        const where = {
          id: request.id,
          organizationId: access.organizationId,
          status: 'REQUESTED',
        };
        if (kind === 'REFUND') await transaction.refundRequest.update({ where, data });
        else await transaction.paymentReversalRequest.update({ where, data });
        await this.audit.write(transaction, {
          organizationId: access.organizationId,
          actorUserId: access.actorUserId,
          action: operation,
          entityType: kind === 'REFUND' ? 'RefundRequest' : 'PaymentReversalRequest',
          entityId: requestId,
          correlationId: meta.correlationId,
          before: { status: 'REQUESTED' },
          after: {
            status: decision,
            reason,
            decidedBy: access.actorUserId,
            decidedAt: data.decidedAt.toISOString(),
          },
        });
      }
      await this.idempotency.complete(transaction, attempt.recordId, 200, result);
      return result;
    });
  }

  private read(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    kind: Kind,
    id: string,
  ) {
    const where = { id, organizationId };
    return kind === 'REFUND'
      ? transaction.refundRequest.findFirst({ where })
      : transaction.paymentReversalRequest.findFirst({ where });
  }

  private notFound(kind: Kind) {
    return new NotFoundException({
      code: kind === 'REFUND' ? 'REFUND_REQUEST_NOT_FOUND' : 'REVERSAL_REQUEST_NOT_FOUND',
      messageKey:
        kind === 'REFUND' ? 'finance.refundRequestNotFound' : 'finance.reversalRequestNotFound',
    });
  }
}
