import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { FinancePaymentService } from './finance-payment.service';
import { FinanceReversalService } from './finance-reversal.service';
import { FinanceRefundService } from './finance-refund.service';
import { FinanceInvoiceService } from './finance-invoice.service';
import { FinanceInvoiceVoidService } from './finance-invoice-void.service';
import { FinanceCreditNoteService } from './finance-credit-note.service';
import { FinanceLedgerService } from './finance-ledger.service';
import { FinanceReceiptService } from './finance-receipt.service';
import type { CreateInvoiceDto, CreatePaymentDto } from './finance.dto';

type MutationMeta = { correlationId: string; idempotencyKey: string };
type PaymentResult = { id: string; status: string; version: number; receiptSerial: string | null };
type RequestResult = { id: string; status: string };
type RefundResult = { id: string; amount: string };
type InvoiceDraftResult = { id: string; status: string; version: number };
type InvoiceIssueResult = {
  id: string;
  status: string;
  serialNumber: string | null;
  version: number;
};
type CreditNoteResult = { id: string; serialNumber: string; amount: string };

@Injectable()
export class FinanceService {
  constructor(
    private readonly paymentService: FinancePaymentService,
    private readonly reversalService: FinanceReversalService,
    private readonly refundService: FinanceRefundService,
    private readonly invoiceService: FinanceInvoiceService,
    private readonly invoiceVoidService: FinanceInvoiceVoidService,
    private readonly creditNoteService: FinanceCreditNoteService,
    private readonly ledgerService: FinanceLedgerService,
    private readonly receiptService: FinanceReceiptService,
  ) {}

  async createPayment(
    access: AccessContext,
    input: CreatePaymentDto,
    meta: MutationMeta,
  ): Promise<PaymentResult> {
    return this.paymentService.createPayment(access, input, meta);
  }

  async postPayment(
    access: AccessContext,
    paymentId: string,
    expectedVersion: number,
    meta: MutationMeta,
  ): Promise<PaymentResult> {
    return this.paymentService.postPayment(access, paymentId, expectedVersion, meta);
  }

  async rejectPayment(
    access: AccessContext,
    paymentId: string,
    reason: string,
    expectedVersion: number,
    meta: MutationMeta,
  ): Promise<PaymentResult> {
    return this.paymentService.rejectPayment(access, paymentId, reason, expectedVersion, meta);
  }

  async requestReversal(
    access: AccessContext,
    paymentId: string,
    reason: string,
    meta: MutationMeta,
  ): Promise<RequestResult> {
    return this.reversalService.requestReversal(access, paymentId, reason, meta);
  }

  async approveReversal(
    access: AccessContext,
    requestId: string,
    meta: MutationMeta,
  ): Promise<PaymentResult> {
    return this.reversalService.approveReversal(access, requestId, meta);
  }

  async requestRefund(
    access: AccessContext,
    paymentId: string,
    amount: string,
    reason: string,
    meta: MutationMeta,
  ): Promise<RequestResult> {
    return this.refundService.requestRefund(access, paymentId, amount, reason, meta);
  }

  async approveRefund(
    access: AccessContext,
    requestId: string,
    meta: MutationMeta,
  ): Promise<RefundResult> {
    return this.refundService.approveRefund(access, requestId, meta);
  }

  async createInvoiceDraft(
    access: AccessContext,
    input: CreateInvoiceDto,
    meta: MutationMeta,
  ): Promise<InvoiceDraftResult> {
    return this.invoiceService.createInvoiceDraft(access, input, meta);
  }

  async issueInvoice(
    access: AccessContext,
    invoiceId: string,
    expectedVersion: number,
    meta: MutationMeta,
  ): Promise<InvoiceIssueResult> {
    return this.invoiceService.issueInvoice(access, invoiceId, expectedVersion, meta);
  }

  async voidInvoice(
    access: AccessContext,
    invoiceId: string,
    reason: string,
    expectedVersion: number,
    meta: MutationMeta,
  ): Promise<InvoiceIssueResult> {
    return this.invoiceVoidService.voidInvoice(access, invoiceId, reason, expectedVersion, meta);
  }

  async cancelInvoice(
    access: AccessContext,
    invoiceId: string,
    reason: string,
    expectedVersion: number,
    meta: MutationMeta,
  ): Promise<InvoiceIssueResult> {
    return this.invoiceVoidService.cancelInvoice(access, invoiceId, reason, expectedVersion, meta);
  }

  async createCreditNote(
    access: AccessContext,
    invoiceId: string,
    amount: string,
    reason: string,
    meta: MutationMeta,
  ): Promise<CreditNoteResult> {
    return this.creditNoteService.createCreditNote(access, invoiceId, amount, reason, meta);
  }

  issueReceipt(access: AccessContext, paymentId: string, meta: MutationMeta) {
    return this.receiptService.issue(access, paymentId, meta);
  }

  async postPaymentLedger(
    transaction: Prisma.TransactionClient,
    access: AccessContext,
    paymentId: string,
    preferredInstallmentId?: string,
  ): Promise<void> {
    return this.ledgerService.postPaymentLedger(
      transaction,
      access,
      paymentId,
      preferredInstallmentId,
    );
  }
}
