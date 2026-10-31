import { ConflictException, Injectable } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { AuditService } from '../platform/audit/audit.service';
import { PrismaService } from '../platform/database/prisma.service';
import { IdempotencyService } from '../platform/idempotency/idempotency.service';
import { FinanceAccessService } from './finance-access.service';
import { FinanceLedgerService } from './finance-ledger.service';
import { FinanceReadHelperService, type ReceiptPresentation } from './finance-read-helper.service';

type MutationMeta = { correlationId: string; idempotencyKey: string };

@Injectable()
export class FinanceReceiptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly idempotency: IdempotencyService,
    private readonly accessService: FinanceAccessService,
    private readonly ledger: FinanceLedgerService,
    private readonly presentation: FinanceReadHelperService,
  ) {}

  async issue(access: AccessContext, paymentId: string, meta: MutationMeta) {
    return this.prisma.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId}::uuid AND organization_id = ${access.organizationId}::uuid FOR UPDATE`;
      const payment = await transaction.payment.findFirst({
        where: { id: paymentId, organizationId: access.organizationId },
      });
      if (!payment)
        throw this.presentation.notFound('PAYMENT_NOT_FOUND', 'finance.paymentNotFound');
      await this.accessService.assertBillingAccount(
        transaction,
        access,
        'receipts.issue',
        payment.billingAccountId,
        payment.enrollmentId,
      );
      if (payment.status !== 'POSTED') {
        throw new ConflictException({
          code: 'RECEIPT_PAYMENT_NOT_POSTED',
          messageKey: 'finance.receiptPaymentNotPosted',
        });
      }
      const attempt = await this.idempotency.begin<ReceiptPresentation>(
        transaction,
        access.organizationId,
        'receipt.issue',
        meta.idempotencyKey,
        { paymentId },
      );
      if (attempt.replayed) return attempt.response;
      await this.ledger.postPaymentLedger(transaction, access, payment.id);
      const receipt = await transaction.internalReceipt.findFirstOrThrow({
        where: { organizationId: access.organizationId, paymentId: payment.id },
      });
      const result = this.presentation.receiptPresentation(receipt);
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'receipt.issue',
        entityType: 'InternalReceipt',
        entityId: receipt.id,
        correlationId: meta.correlationId,
        after: {
          paymentId,
          fiscalYear: receipt.fiscalYear,
          serialNumber: receipt.serialNumber.toString(),
        },
      });
      await this.idempotency.complete(transaction, attempt.recordId, 200, result);
      return result;
    });
  }
}
