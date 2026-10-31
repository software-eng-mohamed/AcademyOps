import { ConflictException, Injectable } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { AuditService } from '../platform/audit/audit.service';
import { PrismaService } from '../platform/database/prisma.service';
import { OutboxService } from '../platform/outbox/outbox.service';
import { IdempotencyService } from '../platform/idempotency/idempotency.service';
import { FinanceAccessService } from './finance-access.service';
import { FinanceHelperService } from './finance-helper.service';

type MutationMeta = { correlationId: string; idempotencyKey: string };
type InvoiceIssueResult = {
  id: string;
  status: string;
  serialNumber: string | null;
  version: number;
};

@Injectable()
export class FinanceInvoiceVoidService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly idempotency: IdempotencyService,
    private readonly financeAccess: FinanceAccessService,
    private readonly helper: FinanceHelperService,
  ) {}

  async voidInvoice(
    access: AccessContext,
    invoiceId: string,
    reason: string,
    expectedVersion: number,
    meta: MutationMeta,
  ): Promise<InvoiceIssueResult> {
    return this.prisma.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM internal_invoices WHERE id = ${invoiceId}::uuid AND organization_id = ${access.organizationId}::uuid FOR UPDATE`;
      const invoice = await transaction.internalInvoice.findFirst({
        where: { id: invoiceId, organizationId: access.organizationId },
      });
      if (!invoice) throw this.helper.invoiceNotFound();
      await this.financeAccess.assertBillingAccount(
        transaction,
        access,
        'invoices.issue',
        invoice.billingAccountId,
      );
      const attempt = await this.idempotency.begin<InvoiceIssueResult>(
        transaction,
        access.organizationId,
        'invoice.void',
        meta.idempotencyKey,
        { invoiceId, reason, expectedVersion },
      );
      if (attempt.replayed) return attempt.response;
      if (invoice.status === 'VOIDED') {
        const result = this.helper.invoiceResult(invoice);
        await this.idempotency.complete(transaction, attempt.recordId, 200, result);
        return result;
      }
      if (invoice.status !== 'ISSUED' || invoice.version !== expectedVersion) {
        throw new ConflictException({
          code: 'INVOICE_VOID_INVALID',
          messageKey: 'finance.invoiceVoidInvalid',
        });
      }
      const lines = await transaction.invoiceLine.findMany({
        where: { organizationId: access.organizationId, invoiceId },
        select: { ledgerEntryId: true },
      });
      const debitIds = lines.flatMap((line) => (line.ledgerEntryId ? [line.ledgerEntryId] : []));
      const [allocationCount, creditNoteCount] = await Promise.all([
        transaction.ledgerAllocation.count({
          where: { organizationId: access.organizationId, debitEntryId: { in: debitIds } },
        }),
        transaction.creditNote.count({
          where: { organizationId: access.organizationId, invoiceId },
        }),
      ]);
      if (allocationCount || creditNoteCount) {
        throw new ConflictException({
          code: 'INVOICE_VOID_SETTLED',
          messageKey: 'finance.invoiceVoidSettled',
        });
      }
      const updated = await transaction.internalInvoice.update({
        where: { id: invoice.id },
        data: { status: 'VOIDED', voidedAt: new Date(), version: { increment: 1 } },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'invoice.void',
        entityType: 'InternalInvoice',
        entityId: invoice.id,
        correlationId: meta.correlationId,
        before: { status: invoice.status },
        after: { status: updated.status, reason },
      });
      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'InternalInvoice',
        aggregateId: invoice.id,
        type: 'invoice.voided',
        payload: { invoiceId: invoice.id, reason },
      });
      const result = this.helper.invoiceResult(updated);
      await this.idempotency.complete(transaction, attempt.recordId, 200, result);
      return result;
    });
  }

  async cancelInvoice(
    access: AccessContext,
    invoiceId: string,
    reason: string,
    expectedVersion: number,
    meta: MutationMeta,
  ): Promise<InvoiceIssueResult> {
    return this.prisma.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM internal_invoices WHERE id = ${invoiceId}::uuid AND organization_id = ${access.organizationId}::uuid FOR UPDATE`;
      const invoice = await transaction.internalInvoice.findFirst({
        where: { id: invoiceId, organizationId: access.organizationId },
      });
      if (!invoice) throw this.helper.invoiceNotFound();
      await this.financeAccess.assertBillingAccount(
        transaction,
        access,
        'invoices.issue',
        invoice.billingAccountId,
      );
      const attempt = await this.idempotency.begin<InvoiceIssueResult>(
        transaction,
        access.organizationId,
        'invoice.cancel',
        meta.idempotencyKey,
        { invoiceId, reason, expectedVersion },
      );
      if (attempt.replayed) return attempt.response;
      if (invoice.status === 'CANCELLED') {
        const result = this.helper.invoiceResult(invoice);
        await this.idempotency.complete(transaction, attempt.recordId, 200, result);
        return result;
      }
      if (invoice.status !== 'DRAFT' || invoice.version !== expectedVersion) {
        throw new ConflictException({
          code: 'INVOICE_CANCEL_INVALID',
          messageKey: 'finance.invoiceCancelInvalid',
        });
      }
      const updated = await transaction.internalInvoice.update({
        where: { id: invoice.id },
        data: { status: 'CANCELLED', version: { increment: 1 } },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'invoice.cancel',
        entityType: 'InternalInvoice',
        entityId: invoice.id,
        correlationId: meta.correlationId,
        before: { status: invoice.status },
        after: { status: updated.status, reason },
      });
      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'InternalInvoice',
        aggregateId: invoice.id,
        type: 'invoice.cancelled',
        payload: { invoiceId: invoice.id, reason },
      });
      const result = this.helper.invoiceResult(updated);
      await this.idempotency.complete(transaction, attempt.recordId, 200, result);
      return result;
    });
  }
}
