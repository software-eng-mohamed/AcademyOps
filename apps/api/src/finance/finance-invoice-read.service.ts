import { Injectable } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { FinanceAccessService } from './finance-access.service';
import type { ListEligibleInvoiceEntriesDto, ListInvoicesDto } from './finance.dto';
import { PrismaService } from '../platform/database/prisma.service';
import { FinanceReadHelperService } from './finance-read-helper.service';

@Injectable()
export class FinanceInvoiceReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financeAccess: FinanceAccessService,
    private readonly helper: FinanceReadHelperService,
  ) {}

  async listInvoices(access: AccessContext, input: ListInvoicesDto) {
    return this.prisma.$transaction(async (transaction) => {
      if (input.billingAccountId) {
        await this.financeAccess.assertBillingAccount(
          transaction,
          access,
          'invoices.read',
          input.billingAccountId,
        );
      }
      const visibleBillingIds = await this.financeAccess.visibleBillingAccountIds(
        transaction,
        access,
        'invoices.read',
      );
      const invoices = await transaction.internalInvoice.findMany({
        where: {
          organizationId: access.organizationId,
          ...(input.billingAccountId ? { billingAccountId: input.billingAccountId } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(visibleBillingIds === undefined
            ? {}
            : { billingAccountId: { in: visibleBillingIds } }),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });
      const visible = invoices.slice(0, input.limit);
      const presentations = await this.helper.invoicePresentations(
        transaction,
        access.organizationId,
        visible,
      );
      return {
        items: presentations,
        nextCursor: invoices.length > input.limit ? (visible.at(-1)?.id ?? null) : null,
      };
    });
  }

  async listEligibleEntries(access: AccessContext, input: ListEligibleInvoiceEntriesDto) {
    return this.prisma.$transaction(async (transaction) => {
      await this.financeAccess.assertBillingAccount(
        transaction,
        access,
        'invoices.issue',
        input.billingAccountId,
        input.enrollmentId,
      );
      const activeInvoices = await transaction.internalInvoice.findMany({
        where: {
          organizationId: access.organizationId,
          billingAccountId: input.billingAccountId,
          status: { in: ['DRAFT', 'ISSUED'] },
        },
        select: { id: true },
      });
      const linkedLines = await transaction.invoiceLine.findMany({
        where: {
          organizationId: access.organizationId,
          invoiceId: { in: activeInvoices.map(({ id }) => id) },
          ledgerEntryId: { not: null },
        },
        select: { ledgerEntryId: true },
      });
      const linkedIds = linkedLines.flatMap(({ ledgerEntryId }) =>
        ledgerEntryId ? [ledgerEntryId] : [],
      );
      const entries = await transaction.ledgerEntry.findMany({
        where: {
          organizationId: access.organizationId,
          billingAccountId: input.billingAccountId,
          direction: 'DEBIT',
          currencyCode: 'EGP',
          id: { notIn: linkedIds },
          ...(input.enrollmentId ? { enrollmentId: input.enrollmentId } : {}),
        },
        orderBy: [{ postedAt: 'asc' }, { id: 'asc' }],
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });
      const visible = entries.slice(0, input.limit);
      return {
        items: visible.map((entry) => ({
          id: entry.id,
          enrollmentId: entry.enrollmentId,
          entryType: entry.entryType,
          description: entry.description,
          amount: entry.amount.toFixed(2),
          currencyCode: entry.currencyCode,
          postedAt: entry.postedAt,
        })),
        nextCursor: entries.length > input.limit ? (visible.at(-1)?.id ?? null) : null,
      };
    });
  }

  async readInvoice(access: AccessContext, invoiceId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const invoice = await transaction.internalInvoice.findFirst({
        where: { organizationId: access.organizationId, id: invoiceId },
      });
      if (!invoice) throw this.helper.notFound('INVOICE_NOT_FOUND', 'finance.invoiceNotFound');
      await this.financeAccess.assertBillingAccount(
        transaction,
        access,
        'invoices.read',
        invoice.billingAccountId,
      );
      const [presentation] = await this.helper.invoicePresentations(
        transaction,
        access.organizationId,
        [invoice],
        true,
      );
      return presentation!;
    });
  }
}
