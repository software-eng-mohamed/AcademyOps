import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { AuditService } from '../../platform/audit/audit.service';
import { PrismaService } from '../../platform/database/prisma.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { PaymobClient, PaymobRequestError } from './paymob.client';
import { encryptPaymobSecret } from './paymob';
import {
  PaymobCheckoutHelper,
  type CheckoutResult,
  type PreparedCheckout,
} from './paymob-checkout-helper.service';

@Injectable()
export class PaymobCheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly client: PaymobClient,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly helper: PaymobCheckoutHelper,
  ) {}

  async createCheckout(
    access: AccessContext,
    installmentId: string,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<CheckoutResult> {
    const configuration = this.client.configuration();
    const prepared = await this.prisma.serializable((transaction) =>
      this.prepareCheckout(transaction, access, installmentId, idempotencyKey, correlationId),
    );

    if (!prepared.created) {
      return this.helper.replayCheckout(
        prepared,
        configuration.publicKey,
        configuration.baseUrl,
        configuration.encryptionKey,
      );
    }

    try {
      const intention = await this.client.createIntention({
        amount: prepared.amount,
        attemptId: prepared.attemptId,
        installmentOrdinal: prepared.ordinal,
        reference: prepared.reference,
        customer: prepared.customer,
      });
      const encryptedSecret = encryptPaymobSecret(
        intention.clientSecret,
        configuration.encryptionKey,
      );
      const persisted = await this.prisma.$transaction(async (transaction) => {
        const updated = await transaction.paymentGatewayAttempt.updateMany({
          where: { id: prepared.attemptId, status: { in: ['CREATED', 'PENDING'] } },
          data: {
            status: 'PENDING',
            providerIntentionId: intention.intentionId,
            checkoutSecretCiphertext: encryptedSecret,
          },
        });
        if (updated.count === 1) {
          await this.audit.write(transaction, {
            organizationId: access.organizationId,
            actorUserId: access.actorUserId,
            action: 'paymob.checkout.created',
            entityType: 'PaymentGatewayAttempt',
            entityId: prepared.attemptId,
            correlationId,
            after: { providerIntentionId: intention.intentionId, status: 'PENDING' },
          });
        }
        return transaction.paymentGatewayAttempt.findUniqueOrThrow({
          where: { id: prepared.attemptId },
        });
      });
      return {
        attemptId: prepared.attemptId,
        status: persisted.status,
        amount: prepared.amount,
        currencyCode: 'EGP',
        checkoutUrl: persisted.status === 'SUCCEEDED' ? null : intention.checkoutUrl,
        paymentId: persisted.paymentId,
      };
    } catch (error) {
      const failure =
        error instanceof PaymobRequestError
          ? error
          : new PaymobRequestError('Paymob outcome is unknown', true, 'UNEXPECTED_ERROR');
      await this.prisma.$transaction(async (transaction) => {
        await transaction.paymentGatewayAttempt.updateMany({
          where: { id: prepared.attemptId, status: 'CREATED' },
          data: {
            status: failure.outcomeUnknown ? 'UNKNOWN' : 'FAILED',
            failureCode: failure.code,
          },
        });
        await this.audit.write(transaction, {
          organizationId: access.organizationId,
          actorUserId: access.actorUserId,
          action: 'paymob.checkout.failed',
          entityType: 'PaymentGatewayAttempt',
          entityId: prepared.attemptId,
          correlationId,
          after: {
            status: failure.outcomeUnknown ? 'UNKNOWN' : 'FAILED',
            failureCode: failure.code,
          },
        });
      });
      throw new ConflictException({
        code: failure.outcomeUnknown
          ? 'PAYMOB_ATTEMPT_REQUIRES_RECONCILIATION'
          : 'PAYMOB_INTENTION_REJECTED',
        messageKey: failure.outcomeUnknown
          ? 'finance.paymobAttemptRequiresReconciliation'
          : 'finance.paymobIntentionRejected',
      });
    }
  }

  async readCheckout(access: AccessContext, attemptId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const attempt = await transaction.paymentGatewayAttempt.findFirst({
        where: { id: attemptId, organizationId: access.organizationId, provider: 'PAYMOB' },
        select: {
          id: true,
          status: true,
          amount: true,
          currencyCode: true,
          paymentId: true,
          enrollmentId: true,
          updatedAt: true,
        },
      });
      if (!attempt) throw this.helper.attemptNotFound();
      const enrollment = await transaction.enrollment.findFirst({
        where: { id: attempt.enrollmentId, organizationId: access.organizationId },
        select: { homeBranchId: true, studentPersonId: true },
      });
      if (!enrollment) throw this.helper.attemptNotFound();
      this.helper.assertCheckoutScope(access, enrollment.homeBranchId, enrollment.studentPersonId);
      return {
        attemptId: attempt.id,
        status: attempt.status,
        amount: attempt.amount.toFixed(2),
        currencyCode: 'EGP' as const,
        paymentId: attempt.paymentId,
        updatedAt: attempt.updatedAt,
      };
    });
  }

  private async prepareCheckout(
    transaction: Prisma.TransactionClient,
    access: AccessContext,
    installmentId: string,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<PreparedCheckout> {
    const installment = await transaction.installment.findFirst({
      where: { id: installmentId, organizationId: access.organizationId },
    });
    if (!installment) {
      throw this.helper.installmentNotFound();
    }
    const schedule = await transaction.installmentSchedule.findFirstOrThrow({
      where: { id: installment.scheduleId, organizationId: access.organizationId },
    });
    const enrollment = await transaction.enrollment.findFirstOrThrow({
      where: { id: schedule.enrollmentId, organizationId: access.organizationId },
    });
    this.helper.assertCheckoutScope(access, enrollment.homeBranchId, enrollment.studentPersonId);

    if (schedule.status !== 'APPROVED') {
      throw this.helper.installmentNotFound();
    }
    const pricingAgreement = await transaction.pricingAgreement.findFirst({
      where: {
        organizationId: access.organizationId,
        enrollmentId: enrollment.id,
        id: schedule.pricingAgreementId,
        status: 'APPROVED',
      },
    });
    if (!pricingAgreement) {
      throw this.helper.installmentNotFound();
    }

    await transaction.$queryRaw<Array<{ locked: string }>>`
      SELECT pg_advisory_xact_lock(hashtextextended(${`${access.organizationId}:paymob:${idempotencyKey}`}, 0))::text AS locked
    `;
    const prior = await transaction.paymentGatewayAttempt.findFirst({
      where: { organizationId: access.organizationId, provider: 'PAYMOB', idempotencyKey },
    });
    if (prior) {
      if (prior.installmentId !== installmentId) {
        throw new ConflictException({
          code: 'IDEMPOTENCY_KEY_REUSED',
          messageKey: 'errors.idempotencyKeyReused',
        });
      }
      return {
        attemptId: prior.id,
        status: prior.status,
        amount: prior.amount.toFixed(2),
        ordinal: 0,
        reference: prior.internalReference,
        encryptedSecret: prior.checkoutSecretCiphertext,
        paymentId: prior.paymentId,
        customer: { firstName: '', lastName: '', email: '', phone: '' },
        created: false,
      };
    }

    if (!installment.debitEntryId) {
      throw new ConflictException({
        code: 'INSTALLMENT_NOT_ACTIVATED',
        messageKey: 'finance.installmentNotActivated',
      });
    }
    const allocated = await transaction.ledgerAllocation.aggregate({
      where: { organizationId: access.organizationId, debitEntryId: installment.debitEntryId },
      _sum: { amount: true },
    });
    const outstanding = installment.amount.sub(allocated._sum.amount ?? 0);
    if (outstanding.lte(0)) {
      throw new ConflictException({
        code: 'INSTALLMENT_ALREADY_PAID',
        messageKey: 'finance.installmentAlreadyPaid',
      });
    }
    const active = await transaction.paymentGatewayAttempt.findFirst({
      where: {
        organizationId: access.organizationId,
        installmentId,
        status: { in: ['CREATED', 'PENDING', 'UNKNOWN'] },
      },
    });
    if (active) {
      throw new ConflictException({
        code: 'PAYMOB_INSTALLMENT_ATTEMPT_ACTIVE',
        messageKey: 'finance.paymobInstallmentAttemptActive',
      });
    }
    const customer = await this.helper.resolveCustomer(
      transaction,
      access.organizationId,
      enrollment.studentPersonId,
    );
    const attempt = await transaction.paymentGatewayAttempt.create({
      data: {
        organizationId: access.organizationId,
        installmentId,
        enrollmentId: enrollment.id,
        billingAccountId: enrollment.billingAccountId,
        internalReference: `PLG-${randomUUID()}`,
        amount: outstanding,
        idempotencyKey,
        createdBy: access.actorUserId,
      },
    });
    await this.audit.write(transaction, {
      organizationId: access.organizationId,
      actorUserId: access.actorUserId,
      action: 'paymob.checkout.requested',
      entityType: 'PaymentGatewayAttempt',
      entityId: attempt.id,
      correlationId,
      after: { installmentId, amount: outstanding.toFixed(2) },
    });
    await this.outbox.add(transaction, {
      organizationId: access.organizationId,
      aggregateType: 'PaymentGatewayAttempt',
      aggregateId: attempt.id,
      type: 'paymob.checkout.requested',
      payload: { gatewayAttemptId: attempt.id, installmentId },
    });
    return {
      attemptId: attempt.id,
      status: attempt.status,
      amount: outstanding.toFixed(2),
      ordinal: installment.ordinal,
      reference: attempt.internalReference,
      encryptedSecret: null,
      paymentId: null,
      customer,
      created: true,
    };
  }
}
