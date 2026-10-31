import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class FinanceReadHelperService {
  paymentPresentation(
    payment: {
      id: string;
      status: string;
      amount: Prisma.Decimal;
      currencyCode: string;
      billingAccountId: string;
      enrollmentId: string | null;
      methodId: string;
      externalReference: string | null;
      receivedAt: Date;
      postedAt: Date | null;
      version: number;
      createdAt: Date;
      updatedAt: Date;
    },
    refunded: Prisma.Decimal,
  ) {
    return {
      ...payment,
      amount: payment.amount.toFixed(2),
      refundedAmount: refunded.toFixed(2),
      refundStatus: refunded.lte(0)
        ? 'NONE'
        : refunded.gte(payment.amount)
          ? 'FULLY_REFUNDED'
          : 'PARTIALLY_REFUNDED',
    };
  }

  receiptPresentation(receipt: {
    id: string;
    paymentId: string;
    billingAccountId: string;
    fiscalYear: number;
    serialNumber: bigint;
    amount: Prisma.Decimal;
    currencyCode: string;
    payerSnapshot: Prisma.JsonValue;
    issuedAt: Date;
    createdBy: string;
    createdAt: Date;
  }) {
    return {
      ...receipt,
      serialNumber: receipt.serialNumber.toString(),
      amount: receipt.amount.toFixed(2),
      documentLabel: 'INTERNAL_RECEIPT',
    };
  }

  invoicePaymentStatus(
    legalStatus: string,
    total: Prisma.Decimal,
    settled: Prisma.Decimal,
    credited: Prisma.Decimal,
  ) {
    if (legalStatus !== 'ISSUED') return legalStatus;
    if (credited.gte(total)) return 'CREDITED';
    if (settled.gte(total)) return 'PAID';
    if (settled.gt(0)) return 'PARTIALLY_PAID';
    return 'UNPAID';
  }

  async invoicePresentations(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    invoices: Array<{
      id: string;
      status: string;
      fiscalYear: number | null;
      serialNumber: bigint | null;
      currencyCode: string;
      subtotal: Prisma.Decimal;
      taxAmount: Prisma.Decimal;
      totalAmount: Prisma.Decimal;
      billingAccountId: string;
      version: number;
      customerSnapshot: Prisma.JsonValue | null;
      issuedAt: Date | null;
      voidedAt: Date | null;
      createdBy: string;
      createdAt: Date;
      updatedAt: Date;
    }>,
    withLines = false,
  ) {
    const lines = await transaction.invoiceLine.findMany({
      where: { organizationId, invoiceId: { in: invoices.map(({ id }) => id) } },
      orderBy: { createdAt: 'asc' },
    });
    const debitIds = lines.flatMap(({ ledgerEntryId }) => (ledgerEntryId ? [ledgerEntryId] : []));
    const [allocations, notes] = await Promise.all([
      transaction.ledgerAllocation.groupBy({
        by: ['debitEntryId'],
        where: { organizationId, debitEntryId: { in: debitIds } },
        _sum: { amount: true },
      }),
      transaction.creditNote.findMany({
        where: { organizationId, invoiceId: { in: invoices.map(({ id }) => id) } },
      }),
    ]);
    const allocated = new Map(
      allocations.map(({ debitEntryId, _sum }) => [
        debitEntryId,
        _sum.amount ?? new Prisma.Decimal(0),
      ]),
    );
    return invoices.map((invoice) => {
      const invoiceLines = lines.filter(({ invoiceId }) => invoiceId === invoice.id);
      const settled = invoiceLines.reduce(
        (sum, line) => sum.add(line.ledgerEntryId ? (allocated.get(line.ledgerEntryId) ?? 0) : 0),
        new Prisma.Decimal(0),
      );
      const credited = notes
        .filter(({ invoiceId }) => invoiceId === invoice.id)
        .reduce((sum, note) => sum.add(note.amount), new Prisma.Decimal(0));
      return {
        ...invoice,
        serialNumber: invoice.serialNumber?.toString() ?? null,
        subtotal: invoice.subtotal.toFixed(2),
        taxAmount: invoice.taxAmount.toFixed(2),
        totalAmount: invoice.totalAmount.toFixed(2),
        settledAmount: settled.toFixed(2),
        creditedAmount: credited.toFixed(2),
        paymentStatus: this.invoicePaymentStatus(
          invoice.status,
          invoice.totalAmount,
          settled,
          credited,
        ),
        ...(withLines
          ? {
              lines: invoiceLines.map((line) => ({
                ...line,
                quantity: line.quantity.toFixed(2),
                unitAmount: line.unitAmount.toFixed(2),
                taxAmount: line.taxAmount.toFixed(2),
                lineTotal: line.lineTotal.toFixed(2),
              })),
              creditNotes: notes
                .filter(({ invoiceId }) => invoiceId === invoice.id)
                .map((note) => ({
                  ...note,
                  serialNumber: note.serialNumber.toString(),
                  amount: note.amount.toFixed(2),
                })),
            }
          : {}),
      };
    });
  }

  agingBucket(ageDays: number) {
    if (ageDays <= 0) return 'CURRENT';
    if (ageDays <= 30) return 'DAYS_1_30';
    if (ageDays <= 60) return 'DAYS_31_60';
    if (ageDays <= 90) return 'DAYS_61_90';
    return 'DAYS_91_PLUS';
  }

  notFound(code: string, messageKey: string) {
    return new NotFoundException({ code, messageKey });
  }
}

export type ReceiptPresentation = ReturnType<FinanceReadHelperService['receiptPresentation']>;
