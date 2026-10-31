import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { AuditService } from '../platform/audit/audit.service';
import { PrismaService } from '../platform/database/prisma.service';
import { OutboxService } from '../platform/outbox/outbox.service';
import { IdempotencyService } from '../platform/idempotency/idempotency.service';
import { FinanceAccessService } from './finance-access.service';
import { FinanceHelperService } from './finance-helper.service';
import { FinanceLedgerService } from './finance-ledger.service';
import type { CreatePaymentDto } from './finance.dto';

type MutationMeta = { correlationId: string; idempotencyKey: string };
type PaymentResult = { id: string; status: string; version: number; receiptSerial: string | null };

@Injectable()
export class FinancePaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly idempotency: IdempotencyService,
    private readonly financeAccess: FinanceAccessService,
    private readonly helper: FinanceHelperService,
    private readonly ledger: FinanceLedgerService,
  ) {}

  async createPayment(
    access: AccessContext,
    input: CreatePaymentDto,
    meta: MutationMeta,
  ): Promise<PaymentResult> {
    return this.prisma.serializable(async (transaction) => {
      await this.financeAccess.assertBillingAccount(
        transaction,
        access,
        'payments.record',
        input.billingAccountId,
        input.enrollmentId,
      );
      const attempt = await this.idempotency.begin<PaymentResult>(
        transaction,
        access.organizationId,
        'payment.create',
        meta.idempotencyKey,
        input,
      );
      if (attempt.replayed) return attempt.response;
      const existing = await transaction.payment.findFirst({
        where: { organizationId: access.organizationId, idempotencyKey: meta.idempotencyKey },
      });
      if (existing) {
        const result = await this.helper.paymentResult(transaction, existing.id);
        await this.idempotency.complete(transaction, attempt.recordId, 200, result);
        return result;
      }

      const method = await transaction.paymentMethod.findFirst({
        where: { id: input.methodId, organizationId: access.organizationId, isActive: true },
      });
      if (!method)
        throw new NotFoundException({
          code: 'PAYMENT_METHOD_NOT_FOUND',
          messageKey: 'finance.paymentMethodNotFound',
        });

      if (method.code === 'PAYMOB') {
        throw new ConflictException({
          code: 'PAYMOB_MANUAL_CREATION_REJECTED',
          messageKey: 'finance.paymobManualCreationRejected',
        });
      }
      if (
        ['INSTAPAY', 'VODAFONE_CASH', 'BANK_TRANSFER'].includes(method.code) &&
        (!input.externalReference || !input.externalReference.trim())
      ) {
        throw new ConflictException({
          code: 'EXTERNAL_REFERENCE_REQUIRED',
          messageKey: 'finance.externalReferenceRequired',
        });
      }
      const externalReference = await this.helper.uniquePaymentReference(
        transaction,
        access.organizationId,
        method.id,
        input.externalReference,
      );
      const billing = await transaction.billingAccount.findFirst({
        where: { id: input.billingAccountId, organizationId: access.organizationId },
      });
      if (!billing)
        throw new NotFoundException({
          code: 'BILLING_ACCOUNT_NOT_FOUND',
          messageKey: 'finance.billingAccountNotFound',
        });
      const initialStatus = method.code === 'CASH' ? 'POSTED' : 'PENDING_VERIFICATION';
      const payment = await transaction.payment.create({
        data: {
          organizationId: access.organizationId,
          billingAccountId: billing.id,
          enrollmentId: input.enrollmentId ?? null,
          methodId: method.id,
          status: initialStatus,
          amount: new Prisma.Decimal(input.amount),
          externalReference,
          idempotencyKey: meta.idempotencyKey,
          receivedAt: new Date(input.receivedAt),
          postedAt: initialStatus === 'POSTED' ? new Date() : null,
          createdBy: access.actorUserId,
        },
      });
      await transaction.paymentEvent.create({
        data: {
          organizationId: access.organizationId,
          paymentId: payment.id,
          toStatus: initialStatus,
          actorUserId: access.actorUserId,
        },
      });
      if (initialStatus === 'POSTED')
        await this.ledger.postPaymentLedger(transaction, access, payment.id);
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'payment.record',
        entityType: 'Payment',
        entityId: payment.id,
        correlationId: meta.correlationId,
        after: { status: initialStatus, amount: input.amount, methodId: method.id },
      });
      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'Payment',
        aggregateId: payment.id,
        type: initialStatus === 'POSTED' ? 'payment.posted' : 'payment.recorded',
        payload: { paymentId: payment.id, status: initialStatus },
      });
      const result = await this.helper.paymentResult(transaction, payment.id);
      await this.idempotency.complete(transaction, attempt.recordId, 201, result);
      return result;
    });
  }

  async postPayment(
    access: AccessContext,
    paymentId: string,
    expectedVersion: number,
    meta: MutationMeta,
  ): Promise<PaymentResult> {
    return this.prisma.serializable(async (transaction) => {
      await this.helper.lockPayment(transaction, access.organizationId, paymentId);
      const payment = await transaction.payment.findFirst({
        where: { id: paymentId, organizationId: access.organizationId },
      });
      if (!payment) throw this.helper.paymentNotFound();
      await this.financeAccess.assertBillingAccount(
        transaction,
        access,
        'payments.verify',
        payment.billingAccountId,
        payment.enrollmentId,
      );
      const attempt = await this.idempotency.begin<PaymentResult>(
        transaction,
        access.organizationId,
        'payment.post',
        meta.idempotencyKey,
        { paymentId, expectedVersion },
      );
      if (attempt.replayed) return attempt.response;
      if (payment.status === 'POSTED') {
        const result = await this.helper.paymentResult(transaction, payment.id);
        await this.idempotency.complete(transaction, attempt.recordId, 200, result);
        return result;
      }
      if (payment.version !== expectedVersion) {
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          messageKey: 'errors.versionConflict',
        });
      }
      if (payment.status !== 'PENDING_VERIFICATION') {
        throw new ConflictException({
          code: 'PAYMENT_POST_INVALID',
          messageKey: 'finance.paymentPostInvalid',
        });
      }
      await transaction.payment.update({
        where: { id: payment.id },
        data: { status: 'POSTED', postedAt: new Date(), version: { increment: 1 } },
      });
      await transaction.paymentEvent.create({
        data: {
          organizationId: access.organizationId,
          paymentId: payment.id,
          fromStatus: payment.status,
          toStatus: 'POSTED',
          actorUserId: access.actorUserId,
        },
      });
      await this.ledger.postPaymentLedger(transaction, access, payment.id);
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'payment.post',
        entityType: 'Payment',
        entityId: payment.id,
        correlationId: meta.correlationId,
      });
      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'Payment',
        aggregateId: payment.id,
        type: 'payment.posted',
        payload: { paymentId: payment.id },
      });
      const result = await this.helper.paymentResult(transaction, payment.id);
      await this.idempotency.complete(transaction, attempt.recordId, 200, result);
      return result;
    });
  }

  async rejectPayment(
    access: AccessContext,
    paymentId: string,
    reason: string,
    expectedVersion: number,
    meta: MutationMeta,
  ): Promise<PaymentResult> {
    return this.prisma.serializable(async (transaction) => {
      await this.helper.lockPayment(transaction, access.organizationId, paymentId);
      const payment = await transaction.payment.findFirst({
        where: { id: paymentId, organizationId: access.organizationId },
      });
      if (!payment) throw this.helper.paymentNotFound();
      await this.financeAccess.assertBillingAccount(
        transaction,
        access,
        'payments.verify',
        payment.billingAccountId,
        payment.enrollmentId,
      );
      const attempt = await this.idempotency.begin<PaymentResult>(
        transaction,
        access.organizationId,
        'payment.reject',
        meta.idempotencyKey,
        { paymentId, reason, expectedVersion },
      );
      if (attempt.replayed) return attempt.response;
      if (payment.status === 'REJECTED') {
        const result = await this.helper.paymentResult(transaction, payment.id);
        await this.idempotency.complete(transaction, attempt.recordId, 200, result);
        return result;
      }
      if (payment.version !== expectedVersion || payment.status !== 'PENDING_VERIFICATION') {
        throw new ConflictException({
          code: 'PAYMENT_REJECT_INVALID',
          messageKey: 'finance.paymentRejectInvalid',
        });
      }
      await transaction.payment.update({
        where: { id: payment.id },
        data: { status: 'REJECTED', version: { increment: 1 } },
      });
      await transaction.paymentEvent.create({
        data: {
          organizationId: access.organizationId,
          paymentId: payment.id,
          fromStatus: payment.status,
          toStatus: 'REJECTED',
          reason,
          actorUserId: access.actorUserId,
        },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'payment.reject',
        entityType: 'Payment',
        entityId: payment.id,
        correlationId: meta.correlationId,
        before: { status: payment.status },
        after: { status: 'REJECTED', reason },
      });
      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'Payment',
        aggregateId: payment.id,
        type: 'payment.rejected',
        payload: { paymentId: payment.id, reason },
      });
      const result = await this.helper.paymentResult(transaction, payment.id);
      await this.idempotency.complete(transaction, attempt.recordId, 200, result);
      return result;
    });
  }
}
