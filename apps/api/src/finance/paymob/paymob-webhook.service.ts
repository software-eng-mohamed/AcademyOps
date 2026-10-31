import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../platform/database/prisma.service';
import { PaymobClient } from './paymob.client';
import { FinanceService } from '../finance.service';
import { AuditService } from '../../platform/audit/audit.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { parsePaymobCallback, verifyPaymobCallback, paymobBoolean } from './paymob';
import type { AccessContext } from '@academyops/contracts';

@Injectable()
export class PaymobWebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly client: PaymobClient,
    private readonly finance: FinanceService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async handleWebhook(payload: unknown, suppliedHmac: string, correlationId: string) {
    const configuration = this.client.configuration();
    let callback;
    try {
      callback = parsePaymobCallback(payload);
    } catch {
      throw new BadRequestException({
        code: 'PAYMOB_WEBHOOK_INVALID',
        messageKey: 'finance.paymobWebhookInvalid',
      });
    }
    if (!verifyPaymobCallback(callback.obj, suppliedHmac, configuration.hmacSecret)) {
      throw new UnauthorizedException({
        code: 'PAYMOB_HMAC_INVALID',
        messageKey: 'finance.paymobHmacInvalid',
      });
    }

    const transaction = callback.obj;
    const reference = String(transaction.order.merchant_order_id ?? '');
    const providerTransactionId = String(transaction.id);
    const integrationId = Number(transaction.integration_id);
    const amountCents = Number(transaction.amount_cents);
    if (
      !/^PLG-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        reference,
      ) ||
      !/^\d{1,30}$/.test(providerTransactionId) ||
      !Number.isSafeInteger(integrationId) ||
      !configuration.paymentMethodIds.includes(integrationId) ||
      !Number.isSafeInteger(amountCents) ||
      amountCents <= 0
    ) {
      throw new BadRequestException({
        code: 'PAYMOB_WEBHOOK_INVALID',
        messageKey: 'finance.paymobWebhookInvalid',
      });
    }

    const eventType = this.eventType(transaction);
    const payloadDigest = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    return this.prisma.serializable(async (database) => {
      const candidate = await database.paymentGatewayAttempt.findUnique({
        where: { internalReference: reference },
      });
      if (!candidate) {
        throw new NotFoundException({
          code: 'PAYMOB_ATTEMPT_NOT_FOUND',
          messageKey: 'finance.paymobAttemptNotFound',
        });
      }
      await database.$queryRaw`SELECT id FROM payment_gateway_attempts WHERE id = ${candidate.id}::uuid FOR UPDATE`;
      const attempt = await database.paymentGatewayAttempt.findUniqueOrThrow({
        where: { id: candidate.id },
      });
      const duplicate = await database.paymentGatewayEvent.findFirst({
        where: {
          organizationId: attempt.organizationId,
          provider: 'PAYMOB',
          providerEventId: providerTransactionId,
          eventType,
        },
      });
      if (duplicate) return { accepted: true, duplicate: true, status: attempt.status };

      const expectedCents = attempt.amount.mul(100).toNumber();
      if (amountCents !== expectedCents || String(transaction.currency).toUpperCase() !== 'EGP') {
        throw new BadRequestException({
          code: 'PAYMOB_WEBHOOK_AMOUNT_MISMATCH',
          messageKey: 'finance.paymobWebhookAmountMismatch',
        });
      }

      let status = attempt.status;
      let paymentId = attempt.paymentId;
      if (eventType === 'TRANSACTION_SUCCEEDED') {
        if (!paymentId) {
          const method = await database.paymentMethod.findFirst({
            where: { organizationId: attempt.organizationId, code: 'PAYMOB', isActive: true },
          });
          if (!method) {
            throw new ConflictException({
              code: 'PAYMOB_PAYMENT_METHOD_MISSING',
              messageKey: 'finance.paymobPaymentMethodMissing',
            });
          }
          const payment = await database.payment.create({
            data: {
              organizationId: attempt.organizationId,
              billingAccountId: attempt.billingAccountId,
              enrollmentId: attempt.enrollmentId,
              methodId: method.id,
              status: 'POSTED',
              amount: attempt.amount,
              externalReference: providerTransactionId,
              idempotencyKey: `paymob:webhook:${providerTransactionId}`,
              receivedAt: this.callbackDate(transaction.created_at),
              postedAt: new Date(),
              createdBy: attempt.createdBy,
            },
          });
          await database.paymentEvent.create({
            data: {
              organizationId: attempt.organizationId,
              paymentId: payment.id,
              toStatus: 'POSTED',
              reason: 'Verified Paymob webhook',
              actorUserId: attempt.createdBy,
            },
          });
          await this.finance.postPaymentLedger(
            database,
            this.gatewayAccess(attempt.organizationId, attempt.createdBy),
            payment.id,
            attempt.installmentId,
          );
          await this.audit.write(database, {
            organizationId: attempt.organizationId,
            action: 'paymob.payment.posted',
            entityType: 'Payment',
            entityId: payment.id,
            correlationId,
            after: {
              gatewayAttemptId: attempt.id,
              providerTransactionId,
              amount: attempt.amount.toFixed(2),
            },
          });
          await this.outbox.add(database, {
            organizationId: attempt.organizationId,
            aggregateType: 'Payment',
            aggregateId: payment.id,
            type: 'payment.posted',
            payload: { paymentId: payment.id, source: 'PAYMOB', gatewayAttemptId: attempt.id },
          });
          paymentId = payment.id;
        }
        status = 'SUCCEEDED';
        await database.paymentGatewayAttempt.update({
          where: { id: attempt.id },
          data: { status, paymentId, providerTransactionId, failureCode: null },
        });
      } else if (eventType === 'TRANSACTION_FAILED') {
        if (attempt.status !== 'SUCCEEDED') {
          status = 'FAILED';
          await database.paymentGatewayAttempt.update({
            where: { id: attempt.id },
            data: { status, providerTransactionId, failureCode: 'TRANSACTION_FAILED' },
          });
        }
      } else if (eventType === 'TRANSACTION_PENDING') {
        if (attempt.status === 'CREATED') {
          status = 'PENDING';
          await database.paymentGatewayAttempt.update({
            where: { id: attempt.id },
            data: { status, providerTransactionId },
          });
        }
      } else {
        await this.outbox.add(database, {
          organizationId: attempt.organizationId,
          aggregateType: 'PaymentGatewayAttempt',
          aggregateId: attempt.id,
          type: 'paymob.reversal.observed',
          payload: { gatewayAttemptId: attempt.id, providerTransactionId, eventType },
        });
      }

      await database.paymentGatewayEvent.create({
        data: {
          organizationId: attempt.organizationId,
          attemptId: attempt.id,
          provider: 'PAYMOB',
          providerEventId: providerTransactionId,
          eventType,
          payloadDigest,
          processedAt: new Date(),
        },
      });
      return { accepted: true, duplicate: false, status, paymentId };
    });
  }

  private eventType(transaction: ReturnType<typeof parsePaymobCallback>['obj']): string {
    if (paymobBoolean(transaction.is_refunded) || paymobBoolean(transaction.is_voided)) {
      return 'TRANSACTION_REVERSAL_OBSERVED';
    }
    if (paymobBoolean(transaction.pending)) return 'TRANSACTION_PENDING';
    if (paymobBoolean(transaction.success) && !paymobBoolean(transaction.error_occured)) {
      return 'TRANSACTION_SUCCEEDED';
    }
    return 'TRANSACTION_FAILED';
  }

  private callbackDate(value: unknown): Date {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? new Date() : date;
  }

  private gatewayAccess(organizationId: string, actorUserId: string): AccessContext {
    return {
      organizationId,
      actorUserId,
      grants: new Map(),
      branchIds: new Set(),
      assignedResourceIds: new Set(),
    };
  }
}
