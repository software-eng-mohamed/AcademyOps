import { Module } from '@nestjs/common';
import { PlatformModule } from '../platform/platform.module';
import { FinanceController } from './finance.controller';
import { FinanceRequestDecisionController } from './finance-request-decision.controller';
import { FinanceRequestDecisionService } from './finance-request-decision.service';
import { FinanceInstallmentController } from './finance-installment.controller';
import { FinanceAccessService } from './finance-access.service';
import { FinanceService } from './finance.service';
import { FinanceReadService } from './finance-read.service';
import { FinanceReadHelperService } from './finance-read-helper.service';
import { FinancePaymentReadService } from './finance-payment-read.service';
import { FinanceInvoiceReadService } from './finance-invoice-read.service';
import { FinanceReceiptReadService } from './finance-receipt-read.service';
import { FinanceBalanceReadService } from './finance-balance-read.service';
import { FinanceInstallmentReadService } from './finance-installment-read.service';
import { PaymobClient } from './paymob/paymob.client';
import { PaymobPaymentsService } from './paymob/paymob-payments.service';
import { PaymobCheckoutService } from './paymob/paymob-checkout.service';
import { PaymobWebhookService } from './paymob/paymob-webhook.service';
import { PaymobCheckoutHelper } from './paymob/paymob-checkout-helper.service';
import { PricingController } from './pricing/pricing.controller';
import { PricingService } from './pricing/pricing.service';
import { PricingHelperService } from './pricing/pricing-helper.service';
import { PricingReadService } from './pricing/pricing-read.service';
import { PricingAgreementService } from './pricing/pricing-agreement.service';
import { PricingApprovalService } from './pricing/pricing-approval.service';
import { PricingScheduleService } from './pricing/pricing-schedule.service';
import { FinanceHelperService } from './finance-helper.service';
import { FinanceLedgerService } from './finance-ledger.service';
import { FinancePaymentService } from './finance-payment.service';
import { FinanceReversalService } from './finance-reversal.service';
import { FinanceRefundService } from './finance-refund.service';
import { FinanceInvoiceService } from './finance-invoice.service';
import { FinanceInvoiceVoidService } from './finance-invoice-void.service';
import { FinanceCreditNoteService } from './finance-credit-note.service';
import { FinanceReceiptService } from './finance-receipt.service';

@Module({
  imports: [PlatformModule],
  controllers: [
    FinanceController,
    PricingController,
    FinanceInstallmentController,
    FinanceRequestDecisionController,
  ],
  providers: [
    FinanceRequestDecisionService,
    FinanceAccessService,
    FinanceReadService,
    FinanceReadHelperService,
    FinancePaymentReadService,
    FinanceInvoiceReadService,
    FinanceReceiptReadService,
    FinanceBalanceReadService,
    FinanceInstallmentReadService,
    FinanceService,
    PricingService,
    PricingHelperService,
    PricingReadService,
    PricingAgreementService,
    PricingApprovalService,
    PricingScheduleService,
    PaymobClient,
    PaymobPaymentsService,
    PaymobCheckoutService,
    PaymobWebhookService,
    PaymobCheckoutHelper,
    FinanceHelperService,
    FinanceLedgerService,
    FinancePaymentService,
    FinanceReversalService,
    FinanceRefundService,
    FinanceInvoiceService,
    FinanceInvoiceVoidService,
    FinanceCreditNoteService,
    FinanceReceiptService,
  ],
  exports: [FinanceAccessService],
})
export class FinanceModule {}
