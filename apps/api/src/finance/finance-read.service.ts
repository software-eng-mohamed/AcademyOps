import { Injectable } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { FinancePaymentReadService } from './finance-payment-read.service';
import { FinanceInvoiceReadService } from './finance-invoice-read.service';
import { FinanceReceiptReadService } from './finance-receipt-read.service';
import { FinanceBalanceReadService } from './finance-balance-read.service';
import type {
  AgingReportDto,
  ListInvoicesDto,
  ListEligibleInvoiceEntriesDto,
  ListPaymentsDto,
  ListReceiptsDto,
  PaymentMethodMixDto,
} from './finance.dto';

@Injectable()
export class FinanceReadService {
  constructor(
    private readonly paymentRead: FinancePaymentReadService,
    private readonly invoiceRead: FinanceInvoiceReadService,
    private readonly receiptRead: FinanceReceiptReadService,
    private readonly balanceRead: FinanceBalanceReadService,
  ) {}

  async paymentMethods(access: AccessContext) {
    return this.paymentRead.paymentMethods(access);
  }

  async listPayments(access: AccessContext, input: ListPaymentsDto) {
    return this.paymentRead.listPayments(access, input);
  }

  async paymentMethodMix(access: AccessContext, input: PaymentMethodMixDto) {
    return this.paymentRead.paymentMethodMix(access, input);
  }

  async readPayment(access: AccessContext, paymentId: string) {
    return this.paymentRead.readPayment(access, paymentId);
  }

  async listInvoices(access: AccessContext, input: ListInvoicesDto) {
    return this.invoiceRead.listInvoices(access, input);
  }

  async readInvoice(access: AccessContext, invoiceId: string) {
    return this.invoiceRead.readInvoice(access, invoiceId);
  }

  async listEligibleInvoiceEntries(access: AccessContext, input: ListEligibleInvoiceEntriesDto) {
    return this.invoiceRead.listEligibleEntries(access, input);
  }

  async listReceipts(access: AccessContext, input: ListReceiptsDto) {
    return this.receiptRead.listReceipts(access, input);
  }

  async readReceipt(access: AccessContext, receiptId: string) {
    return this.receiptRead.readReceipt(access, receiptId);
  }

  async billingSummary(access: AccessContext, billingAccountId: string) {
    return this.balanceRead.billingSummary(access, billingAccountId);
  }

  async enrollmentSummary(access: AccessContext, enrollmentId: string) {
    return this.balanceRead.enrollmentSummary(access, enrollmentId);
  }

  async aging(access: AccessContext, input: AgingReportDto) {
    return this.balanceRead.aging(access, input);
  }
}
