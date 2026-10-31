import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AccessContext } from '@academyops/contracts';
import { requireIdempotencyKey, requireVersion } from '../common/http/headers';
import { CurrentAccess, Public, RequirePermission } from '../iam/authorization/decorators';
import { RateLimit } from '../platform/rate-limit/rate-limit.decorator';
import {
  CreateInvoiceDto,
  CreatePaymentDto,
  CreateCreditNoteDto,
  CreateRefundRequestDto,
  FinancialReasonDto,
  AgingReportDto,
  ListInvoicesDto,
  ListEligibleInvoiceEntriesDto,
  ListPaymentsDto,
  ListReceiptsDto,
  PaymentMethodMixDto,
} from './finance.dto';
import { FinanceReadService } from './finance-read.service';
import { FinanceService } from './finance.service';
import { PaymobPaymentsService } from './paymob/paymob-payments.service';

@ApiTags('finance')
@Controller({ path: '', version: '1' })
export class FinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly reads: FinanceReadService,
    private readonly paymob: PaymobPaymentsService,
  ) {}

  @RequirePermission('payments.read')
  @Get('payment-methods')
  paymentMethods(@CurrentAccess() access: AccessContext) {
    return this.reads.paymentMethods(access);
  }

  @RequirePermission('payments.read')
  @Get('payments')
  payments(@CurrentAccess() access: AccessContext, @Query() query: ListPaymentsDto) {
    return this.reads.listPayments(access, query);
  }

  @RequirePermission('payments.read')
  @Get('payments/method-mix')
  paymentMethodMix(@CurrentAccess() access: AccessContext, @Query() query: PaymentMethodMixDto) {
    return this.reads.paymentMethodMix(access, query);
  }

  @RequirePermission('payments.read')
  @Get('payments/:id')
  payment(@CurrentAccess() access: AccessContext, @Param('id') id: string) {
    return this.reads.readPayment(access, id);
  }

  @RequirePermission('invoices.read')
  @Get('invoices')
  invoices(@CurrentAccess() access: AccessContext, @Query() query: ListInvoicesDto) {
    return this.reads.listInvoices(access, query);
  }

  @RequirePermission('invoices.issue')
  @Get('invoices/eligible-ledger-entries')
  eligibleInvoiceEntries(
    @CurrentAccess() access: AccessContext,
    @Query() query: ListEligibleInvoiceEntriesDto,
  ) {
    return this.reads.listEligibleInvoiceEntries(access, query);
  }

  @RequirePermission('invoices.read')
  @Get('invoices/:id')
  invoice(@CurrentAccess() access: AccessContext, @Param('id') id: string) {
    return this.reads.readInvoice(access, id);
  }

  @RequirePermission('receipts.read')
  @Get('receipts')
  receipts(@CurrentAccess() access: AccessContext, @Query() query: ListReceiptsDto) {
    return this.reads.listReceipts(access, query);
  }

  @RequirePermission('receipts.read')
  @Get('receipts/:id')
  receipt(@CurrentAccess() access: AccessContext, @Param('id') id: string) {
    return this.reads.readReceipt(access, id);
  }

  @RequirePermission('finance.balance.read')
  @Get('billing-accounts/:id/finance-summary')
  billingSummary(@CurrentAccess() access: AccessContext, @Param('id') id: string) {
    return this.reads.billingSummary(access, id);
  }

  @RequirePermission('finance.balance.read')
  @Get('enrollments/:id/finance-summary')
  enrollmentSummary(@CurrentAccess() access: AccessContext, @Param('id') id: string) {
    return this.reads.enrollmentSummary(access, id);
  }

  @RequirePermission('finance.reports.read')
  @Get('finance/reports/aging')
  aging(@CurrentAccess() access: AccessContext, @Query() query: AgingReportDto) {
    return this.reads.aging(access, query);
  }

  @RequirePermission('payments.checkout')
  @Post('installments/:id/paymob-checkout')
  createPaymobCheckout(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.paymob.createCheckout(access, id, requireIdempotencyKey(key), correlationId);
  }

  @RequirePermission('payments.checkout')
  @Get('payment-gateway-attempts/:id')
  paymobCheckoutStatus(@CurrentAccess() access: AccessContext, @Param('id') id: string) {
    return this.paymob.readCheckout(access, id);
  }

  @Public()
  @RateLimit({
    name: 'paymob-webhook',
    limit: 300,
    ipLimit: 1_000,
    windowSeconds: 60,
    subject: 'PAYMOB_HMAC',
  })
  @Post('webhooks/paymob/transaction')
  handlePaymobWebhook(
    @Body() payload: unknown,
    @Query('hmac') hmac: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.paymob.handleWebhook(payload, hmac ?? '', correlationId);
  }

  @RequirePermission('payments.record')
  @Post('payments')
  createPayment(
    @CurrentAccess() access: AccessContext,
    @Body() input: CreatePaymentDto,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.finance.createPayment(access, input, {
      idempotencyKey: requireIdempotencyKey(key),
      correlationId,
    });
  }

  @RequirePermission('receipts.issue')
  @Post('payments/:id/receipt')
  issueReceipt(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.finance.issueReceipt(access, id, {
      idempotencyKey: requireIdempotencyKey(key),
      correlationId,
    });
  }

  @RequirePermission('payments.verify')
  @Post('payments/:id/post')
  postPayment(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.finance.postPayment(access, id, requireVersion(ifMatch), {
      idempotencyKey: requireIdempotencyKey(key),
      correlationId,
    });
  }

  @RequirePermission('payments.verify')
  @Post('payments/:id/reject')
  rejectPayment(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: FinancialReasonDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.finance.rejectPayment(access, id, input.reason, requireVersion(ifMatch), {
      idempotencyKey: requireIdempotencyKey(key),
      correlationId,
    });
  }

  @RequirePermission('payments.reverse.request')
  @Post('payments/:id/reversal-requests')
  requestReversal(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: FinancialReasonDto,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.finance.requestReversal(access, id, input.reason, {
      idempotencyKey: requireIdempotencyKey(key),
      correlationId,
    });
  }

  @RequirePermission('payments.reverse.approve')
  @Post('payment-reversal-requests/:id/approve')
  approveReversal(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.finance.approveReversal(access, id, {
      idempotencyKey: requireIdempotencyKey(key),
      correlationId,
    });
  }

  @RequirePermission('refunds.request')
  @Post('payments/:id/refund-requests')
  requestRefund(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: CreateRefundRequestDto,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.finance.requestRefund(access, id, input.amount, input.reason, {
      idempotencyKey: requireIdempotencyKey(key),
      correlationId,
    });
  }

  @RequirePermission('refunds.approve')
  @Post('refund-requests/:id/approve')
  approveRefund(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.finance.approveRefund(access, id, {
      idempotencyKey: requireIdempotencyKey(key),
      correlationId,
    });
  }

  @RequirePermission('invoices.issue')
  @Post('invoices')
  createInvoice(
    @CurrentAccess() access: AccessContext,
    @Body() input: CreateInvoiceDto,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.finance.createInvoiceDraft(access, input, {
      idempotencyKey: requireIdempotencyKey(key),
      correlationId,
    });
  }

  @RequirePermission('invoices.issue')
  @Post('invoices/:id/issue')
  issueInvoice(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.finance.issueInvoice(access, id, requireVersion(ifMatch), {
      idempotencyKey: requireIdempotencyKey(key),
      correlationId,
    });
  }

  @RequirePermission('invoices.issue')
  @Post('invoices/:id/cancel')
  cancelInvoice(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: FinancialReasonDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.finance.cancelInvoice(access, id, input.reason, requireVersion(ifMatch), {
      idempotencyKey: requireIdempotencyKey(key),
      correlationId,
    });
  }

  @RequirePermission('invoices.issue')
  @Post('invoices/:id/void')
  voidInvoice(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: FinancialReasonDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.finance.voidInvoice(access, id, input.reason, requireVersion(ifMatch), {
      idempotencyKey: requireIdempotencyKey(key),
      correlationId,
    });
  }

  @RequirePermission('invoices.issue')
  @Post('invoices/:id/credit-notes')
  createCreditNote(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: CreateCreditNoteDto,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.finance.createCreditNote(access, id, input.amount, input.reason, {
      idempotencyKey: requireIdempotencyKey(key),
      correlationId,
    });
  }
}
