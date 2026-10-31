import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { AuditService } from '../platform/audit/audit.service';
import { PrismaService } from '../platform/database/prisma.service';
import { IdempotencyService } from '../platform/idempotency/idempotency.service';
import { FinanceAccessService } from './finance-access.service';
import { FinanceHelperService } from './finance-helper.service';
import type { CreateInvoiceDto } from './finance.dto';

type MutationMeta = { correlationId: string; idempotencyKey: string };
type InvoiceDraftResult = { id: string; status: string; version: number };
type InvoiceIssueResult = {
  id: string;
  status: string;
  serialNumber: string | null;
  version: number;
};

@Injectable()
export class FinanceInvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly idempotency: IdempotencyService,
    private readonly financeAccess: FinanceAccessService,
    private readonly helper: FinanceHelperService,
  ) {}

  async createInvoiceDraft(
    access: AccessContext,
    input: CreateInvoiceDto,
    meta: MutationMeta,
  ): Promise<InvoiceDraftResult> {
    return this.prisma.serializable(async (transaction) => {
      const billing = await transaction.billingAccount.findFirst({
        where: { id: input.billingAccountId, organizationId: access.organizationId },
      });
      if (!billing)
        throw new NotFoundException({
          code: 'BILLING_ACCOUNT_NOT_FOUND',
          messageKey: 'finance.billingAccountNotFound',
        });
      await this.financeAccess.assertBillingAccount(
        transaction,
        access,
        'invoices.issue',
        billing.id,
      );
      const attempt = await this.idempotency.begin<InvoiceDraftResult>(
        transaction,
        access.organizationId,
        'invoice.create',
        meta.idempotencyKey,
        input,
      );
      if (attempt.replayed) return attempt.response;
      const ledgerIds = input.lines.map((line) => line.ledgerEntryId);
      if (new Set(ledgerIds).size !== ledgerIds.length) {
        throw new ConflictException({
          code: 'INVOICE_DUPLICATE_LEDGER_ENTRY',
          messageKey: 'finance.invoiceDuplicateLedgerEntry',
        });
      }
      const entries = await transaction.ledgerEntry.findMany({
        where: {
          organizationId: access.organizationId,
          id: { in: ledgerIds },
          billingAccountId: billing.id,
          direction: 'DEBIT',
          currencyCode: 'EGP',
        },
      });
      if (entries.length !== ledgerIds.length) {
        throw new ConflictException({
          code: 'INVOICE_LEDGER_ENTRY_INVALID',
          messageKey: 'finance.invoiceLedgerEntryInvalid',
        });
      }
      const linkedLines = await transaction.invoiceLine.findMany({
        where: {
          organizationId: access.organizationId,
          ledgerEntryId: { in: ledgerIds },
        },
        select: { invoiceId: true, ledgerEntryId: true },
      });
      if (linkedLines.length) {
        const activeInvoiceCount = await transaction.internalInvoice.count({
          where: {
            organizationId: access.organizationId,
            id: { in: linkedLines.map(({ invoiceId }) => invoiceId) },
            status: { in: ['DRAFT', 'ISSUED'] },
          },
        });
        if (activeInvoiceCount) {
          throw new ConflictException({
            code: 'INVOICE_LEDGER_ENTRY_ALREADY_LINKED',
            messageKey: 'finance.invoiceLedgerEntryAlreadyLinked',
          });
        }
      }
      const entryById = new Map(entries.map((entry) => [entry.id, entry]));
      const lines = input.lines.map((line) => {
        const quantity = new Prisma.Decimal(line.quantity);
        const unitAmount = new Prisma.Decimal(line.unitAmount);
        const taxAmount = new Prisma.Decimal(line.taxAmount ?? '0');
        if (quantity.lte(0) || unitAmount.lt(0) || taxAmount.lt(0)) {
          throw new ConflictException({
            code: 'INVOICE_LINE_AMOUNT_INVALID',
            messageKey: 'finance.invoiceLineAmountInvalid',
          });
        }
        const baseAmount = quantity.mul(unitAmount).toDecimalPlaces(2);
        const lineTotal = baseAmount.add(taxAmount);
        if (!entryById.get(line.ledgerEntryId)?.amount.equals(lineTotal)) {
          throw new ConflictException({
            code: 'INVOICE_LINE_LEDGER_MISMATCH',
            messageKey: 'finance.invoiceLineLedgerMismatch',
          });
        }
        return { ...line, quantity, unitAmount, taxAmount, baseAmount, lineTotal };
      });
      const subtotal = lines.reduce((sum, line) => sum.add(line.baseAmount), new Prisma.Decimal(0));
      const taxAmount = lines.reduce((sum, line) => sum.add(line.taxAmount), new Prisma.Decimal(0));
      const invoice = await transaction.internalInvoice.create({
        data: {
          organizationId: access.organizationId,
          billingAccountId: billing.id,
          subtotal,
          taxAmount,
          totalAmount: subtotal.add(taxAmount),
          createdBy: access.actorUserId,
        },
      });
      await transaction.invoiceLine.createMany({
        data: lines.map((line) => ({
          organizationId: access.organizationId,
          invoiceId: invoice.id,
          ledgerEntryId: line.ledgerEntryId,
          descriptionAr: line.descriptionAr ?? line.descriptionEn,
          descriptionEn: line.descriptionEn ?? line.descriptionAr ?? '',
          quantity: line.quantity,
          unitAmount: line.unitAmount,
          taxAmount: line.taxAmount,
          lineTotal: line.lineTotal,
        })),
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'invoice.create',
        entityType: 'InternalInvoice',
        entityId: invoice.id,
        correlationId: meta.correlationId,
      });
      const result = { id: invoice.id, status: invoice.status, version: invoice.version };
      await this.idempotency.complete(transaction, attempt.recordId, 201, result);
      return result;
    });
  }

  async issueInvoice(
    access: AccessContext,
    invoiceId: string,
    expectedVersion: number,
    meta: MutationMeta,
  ): Promise<InvoiceIssueResult> {
    return this.prisma.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM internal_invoices WHERE id = ${invoiceId}::uuid AND organization_id = ${access.organizationId}::uuid FOR UPDATE`;
      const invoice = await transaction.internalInvoice.findFirst({
        where: { id: invoiceId, organizationId: access.organizationId },
      });
      if (!invoice)
        throw new NotFoundException({
          code: 'INVOICE_NOT_FOUND',
          messageKey: 'finance.invoiceNotFound',
        });
      await this.financeAccess.assertBillingAccount(
        transaction,
        access,
        'invoices.issue',
        invoice.billingAccountId,
      );
      const attempt = await this.idempotency.begin<InvoiceIssueResult>(
        transaction,
        access.organizationId,
        'invoice.issue',
        meta.idempotencyKey,
        { invoiceId, expectedVersion },
      );
      if (attempt.replayed) return attempt.response;
      if (invoice.status === 'ISSUED') {
        const result = {
          id: invoice.id,
          status: invoice.status,
          serialNumber: invoice.serialNumber?.toString() ?? null,
          version: invoice.version,
        };
        await this.idempotency.complete(transaction, attempt.recordId, 200, result);
        return result;
      }
      if (invoice.status !== 'DRAFT' || invoice.version !== expectedVersion) {
        throw new ConflictException({
          code: 'INVOICE_ISSUE_INVALID',
          messageKey: 'finance.invoiceIssueInvalid',
        });
      }
      const lines = await transaction.invoiceLine.findMany({
        where: { organizationId: access.organizationId, invoiceId: invoice.id },
      });
      if (lines.length === 0) {
        throw new ConflictException({
          code: 'INVOICE_LINES_REQUIRED',
          messageKey: 'finance.invoiceLinesRequired',
        });
      }
      const computedSubtotal = lines.reduce(
        (sum, line) => sum.add(line.quantity.mul(line.unitAmount).toDecimalPlaces(2)),
        new Prisma.Decimal(0),
      );
      const computedTax = lines.reduce(
        (sum, line) => sum.add(line.taxAmount),
        new Prisma.Decimal(0),
      );
      if (
        !invoice.subtotal.equals(computedSubtotal) ||
        !invoice.taxAmount.equals(computedTax) ||
        !invoice.totalAmount.equals(computedSubtotal.add(computedTax))
      ) {
        throw new ConflictException({
          code: 'INVOICE_TOTAL_MISMATCH',
          messageKey: 'finance.invoiceTotalMismatch',
        });
      }
      const payerSnapshot = await this.helper.payerSnapshot(
        transaction,
        access.organizationId,
        invoice.billingAccountId,
      );
      const fiscalYear = new Date().getUTCFullYear();
      const serial = await this.helper.nextDocumentNumber(
        transaction,
        access.organizationId,
        fiscalYear,
        'INVOICE',
      );
      const updated = await transaction.internalInvoice.update({
        where: { id: invoice.id },
        data: {
          status: 'ISSUED',
          fiscalYear,
          serialNumber: serial,
          customerSnapshot: payerSnapshot,
          issuedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'invoice.issue',
        entityType: 'InternalInvoice',
        entityId: invoice.id,
        correlationId: meta.correlationId,
      });
      const result = {
        id: updated.id,
        status: updated.status,
        serialNumber: serial.toString(),
        version: updated.version,
      };
      await this.idempotency.complete(transaction, attempt.recordId, 200, result);
      return result;
    });
  }
}
