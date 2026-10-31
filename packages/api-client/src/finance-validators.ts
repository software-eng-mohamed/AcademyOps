import { PlgApiError } from './errors.js';
import type {
  InvoicesPage,
  PaymentMethod,
  PaymentMethodMix,
  PaymentMutationResult,
  PaymentsPage,
  PaymobCheckoutResult,
  PaymobCheckoutStatus,
  PricingAgreementsPage,
  ReceiptsPage,
} from './finance-models.js';

function invalidResponse(): never {
  throw new PlgApiError(500, {
    code: 'RESPONSE_INVALID',
    messageKey: 'errors.requestFailed',
  });
}
function isObj(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}
export function validatePaymentMethods(data: unknown): PaymentMethod[] {
  if (!Array.isArray(data)) invalidResponse();
  for (const item of data) {
    if (
      !isObj(item) ||
      typeof item.id !== 'string' ||
      typeof item.code !== 'string' ||
      typeof item.name !== 'string' ||
      typeof item.verificationRequired !== 'boolean' ||
      typeof item.isActive !== 'boolean' ||
      typeof item.createdAt !== 'string' ||
      typeof item.updatedAt !== 'string'
    ) {
      invalidResponse();
    }
  }
  return data as PaymentMethod[];
}
export function validatePaymentsPage(data: unknown): PaymentsPage {
  if (!isObj(data) || !Array.isArray(data.items)) invalidResponse();
  if (data.nextCursor !== null && typeof data.nextCursor !== 'string') invalidResponse();
  for (const item of data.items) {
    if (
      !isObj(item) ||
      typeof item.id !== 'string' ||
      typeof item.billingAccountId !== 'string' ||
      (item.enrollmentId !== null && typeof item.enrollmentId !== 'string') ||
      (item.ledgerEntryId !== null && typeof item.ledgerEntryId !== 'string') ||
      typeof item.methodId !== 'string' ||
      (item.method !== null &&
        (!isObj(item.method) ||
          typeof item.method.id !== 'string' ||
          typeof item.method.code !== 'string' ||
          typeof item.method.name !== 'string')) ||
      typeof item.status !== 'string' ||
      typeof item.amount !== 'string' ||
      typeof item.currencyCode !== 'string' ||
      (item.externalReference !== null && typeof item.externalReference !== 'string') ||
      typeof item.idempotencyKey !== 'string' ||
      typeof item.receivedAt !== 'string' ||
      (item.postedAt !== null && typeof item.postedAt !== 'string') ||
      typeof item.createdBy !== 'string' ||
      typeof item.version !== 'number' ||
      typeof item.createdAt !== 'string' ||
      typeof item.updatedAt !== 'string' ||
      typeof item.refundedAmount !== 'string' ||
      typeof item.refundStatus !== 'string'
    ) {
      invalidResponse();
    }
  }
  return data as PaymentsPage;
}
export function validatePaymentMethodMix(data: unknown): PaymentMethodMix {
  if (
    !isObj(data) ||
    typeof data.asOf !== 'string' ||
    !isObj(data.range) ||
    typeof data.range.from !== 'string' ||
    typeof data.range.toExclusive !== 'string' ||
    typeof data.range.fromMonth !== 'string' ||
    typeof data.range.toMonth !== 'string' ||
    data.range.timeZone !== 'Africa/Cairo' ||
    data.currencyCode !== 'EGP' ||
    typeof data.totalAmount !== 'string' ||
    typeof data.totalPayments !== 'number' ||
    !Array.isArray(data.items)
  ) {
    invalidResponse();
  }
  for (const item of data.items) {
    if (
      !isObj(item) ||
      !isObj(item.method) ||
      typeof item.method.id !== 'string' ||
      typeof item.method.code !== 'string' ||
      typeof item.method.name !== 'string' ||
      typeof item.amount !== 'string' ||
      typeof item.paymentCount !== 'number' ||
      typeof item.percentage !== 'number'
    ) {
      invalidResponse();
    }
  }
  return data as PaymentMethodMix;
}
export function validatePaymentMutationResult(data: unknown): PaymentMutationResult {
  if (
    !isObj(data) ||
    typeof data.id !== 'string' ||
    typeof data.status !== 'string' ||
    typeof data.version !== 'number' ||
    (data.receiptSerial !== null && typeof data.receiptSerial !== 'string')
  ) {
    invalidResponse();
  }
  return data as PaymentMutationResult;
}
export function validatePaymobCheckoutResult(data: unknown): PaymobCheckoutResult {
  if (
    !isObj(data) ||
    typeof data.attemptId !== 'string' ||
    typeof data.status !== 'string' ||
    typeof data.amount !== 'string' ||
    data.currencyCode !== 'EGP' ||
    (data.checkoutUrl !== null && typeof data.checkoutUrl !== 'string') ||
    (data.paymentId !== null && typeof data.paymentId !== 'string')
  ) {
    invalidResponse();
  }
  return data as PaymobCheckoutResult;
}
export function validatePaymobCheckoutStatus(data: unknown): PaymobCheckoutStatus {
  if (
    !isObj(data) ||
    typeof data.attemptId !== 'string' ||
    typeof data.status !== 'string' ||
    typeof data.amount !== 'string' ||
    data.currencyCode !== 'EGP' ||
    (data.paymentId !== null && typeof data.paymentId !== 'string') ||
    typeof data.updatedAt !== 'string'
  ) {
    invalidResponse();
  }
  return data as PaymobCheckoutStatus;
}
function validPage(data: unknown): data is {
  items: unknown[];
  nextCursor: string | null;
} {
  return (
    isObj(data) &&
    Array.isArray(data.items) &&
    (data.nextCursor === null || typeof data.nextCursor === 'string')
  );
}
export function validateInvoicesPage(data: unknown): InvoicesPage {
  if (!validPage(data)) invalidResponse();
  for (const item of data.items) {
    if (
      !isObj(item) ||
      typeof item.id !== 'string' ||
      typeof item.status !== 'string' ||
      (item.fiscalYear !== null && typeof item.fiscalYear !== 'number') ||
      (item.serialNumber !== null && typeof item.serialNumber !== 'string') ||
      typeof item.currencyCode !== 'string' ||
      typeof item.subtotal !== 'string' ||
      typeof item.taxAmount !== 'string' ||
      typeof item.totalAmount !== 'string' ||
      typeof item.billingAccountId !== 'string' ||
      typeof item.version !== 'number' ||
      (item.issuedAt !== null && typeof item.issuedAt !== 'string') ||
      (item.voidedAt !== null && typeof item.voidedAt !== 'string') ||
      typeof item.createdBy !== 'string' ||
      typeof item.createdAt !== 'string' ||
      typeof item.updatedAt !== 'string' ||
      typeof item.settledAmount !== 'string' ||
      typeof item.creditedAmount !== 'string' ||
      typeof item.paymentStatus !== 'string'
    ) {
      invalidResponse();
    }
  }
  return data as InvoicesPage;
}
export function validateReceiptsPage(data: unknown): ReceiptsPage {
  if (!validPage(data)) invalidResponse();
  for (const item of data.items) {
    if (
      !isObj(item) ||
      typeof item.id !== 'string' ||
      typeof item.paymentId !== 'string' ||
      typeof item.billingAccountId !== 'string' ||
      typeof item.fiscalYear !== 'number' ||
      typeof item.serialNumber !== 'string' ||
      typeof item.amount !== 'string' ||
      typeof item.currencyCode !== 'string' ||
      typeof item.issuedAt !== 'string' ||
      typeof item.createdBy !== 'string' ||
      typeof item.createdAt !== 'string' ||
      item.documentLabel !== 'INTERNAL_RECEIPT'
    ) {
      invalidResponse();
    }
  }
  return data as ReceiptsPage;
}
export function validatePricingAgreementsPage(data: unknown): PricingAgreementsPage {
  if (!validPage(data)) invalidResponse();
  for (const item of data.items) {
    if (
      !isObj(item) ||
      typeof item.id !== 'string' ||
      typeof item.status !== 'string' ||
      typeof item.version !== 'number' ||
      typeof item.lockVersion !== 'number' ||
      typeof item.subtotal !== 'string' ||
      typeof item.discountAmount !== 'string' ||
      typeof item.totalAmount !== 'string' ||
      (item.requiredApprovalTier !== 1 && item.requiredApprovalTier !== 2)
    ) {
      invalidResponse();
    }
  }
  return data as PricingAgreementsPage;
}
