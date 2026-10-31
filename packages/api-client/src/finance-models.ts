import type { DashboardRangeMeta } from './models.js';
export type PaymentMethod = {
  id: string;
  code: string;
  name: string;
  verificationRequired: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
export type PaymentMethodSummary = Pick<PaymentMethod, 'id' | 'code' | 'name' | 'name'>;
export type Payment = {
  id: string;
  billingAccountId: string;
  enrollmentId: string | null;
  ledgerEntryId: string | null;
  methodId: string;
  method: PaymentMethodSummary | null;
  status: string;
  amount: string;
  currencyCode: string;
  externalReference: string | null;
  idempotencyKey: string;
  receivedAt: string;
  postedAt: string | null;
  createdBy: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  refundedAmount: string;
  refundStatus: string;
  receiptIssued?: boolean;
};
export type PaymentsPage = {
  items: Payment[];
  nextCursor: string | null;
};
export type PaymentMethodMix = {
  asOf: string;
  range: DashboardRangeMeta;
  currencyCode: 'EGP';
  totalAmount: string;
  totalPayments: number;
  items: Array<{
    method: PaymentMethodSummary;
    amount: string;
    paymentCount: number;
    percentage: number;
  }>;
};
export type PaymentMutationResult = {
  id: string;
  status: string;
  version: number;
  receiptSerial: string | null;
};
export type PaymobCheckoutResult = {
  attemptId: string;
  status: string;
  amount: string;
  currencyCode: 'EGP';
  checkoutUrl: string | null;
  paymentId: string | null;
};
export type PaymobCheckoutStatus = {
  attemptId: string;
  status: string;
  amount: string;
  currencyCode: 'EGP';
  paymentId: string | null;
  updatedAt: string;
};
export type Invoice = {
  id: string;
  status: string;
  fiscalYear: number | null;
  serialNumber: string | null;
  currencyCode: string;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  billingAccountId: string;
  version: number;
  customerSnapshot: unknown;
  issuedAt: string | null;
  voidedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  settledAmount: string;
  creditedAmount: string;
  paymentStatus: string;
};
export type InvoicesPage = {
  items: Invoice[];
  nextCursor: string | null;
};
export type Receipt = {
  id: string;
  paymentId: string;
  billingAccountId: string;
  fiscalYear: number;
  serialNumber: string;
  amount: string;
  currencyCode: string;
  payerSnapshot: unknown;
  issuedAt: string;
  createdBy: string;
  createdAt: string;
  documentLabel: 'INTERNAL_RECEIPT';
};
export type ReceiptsPage = {
  items: Receipt[];
  nextCursor: string | null;
};
export type EligibleInvoiceEntry = {
  id: string;
  enrollmentId: string | null;
  entryType: string;
  description: string | null;
  amount: string;
  currencyCode: 'EGP';
  postedAt: string;
};
export type EligibleInvoiceEntriesPage = {
  items: EligibleInvoiceEntry[];
  nextCursor: string | null;
};
export type PricingAgreement = {
  id: string;
  status: string;
  version: number;
  lockVersion: number;
  subtotal: string;
  discountAmount: string;
  totalAmount: string;
  requiredApprovalTier: 1 | 2;
};
export type PricingAgreementsPage = {
  items: PricingAgreement[];
  nextCursor: string | null;
};
export type PricingAgreementDetail = PricingAgreement & {
  enrollmentId: string;
  currencyCode: string;
  lines: Array<{
    id: string;
    type: PricingAgreementLineInput['type'];
    descriptionAr: string;
    descriptionEn: string;
    quantity: string;
    unitAmount: string;
    lineAmount: string;
  }>;
  schedules: Array<{
    id: string;
    status: string;
    version: number;
    lockVersion: number;
    installments: Array<{
      id: string;
      dueDate: string;
      amount: string;
      ordinal: number;
    }>;
  }>;
};
export type PricingAgreementLineInput = {
  type: 'TUITION' | 'REGISTRATION' | 'MATERIALS' | 'OTHER';
  descriptionAr: string;
  descriptionEn: string;
  quantity: string;
  unitAmount: string;
};
export type InstallmentScheduleResult = {
  id: string;
  status: string;
  version: number;
  lockVersion: number;
  totalAmount: string;
};
export type CreatePaymentInput = {
  billingAccountId: string;
  enrollmentId?: string;
  methodId: string;
  amount: string;
  receivedAt: string;
  externalReference?: string;
};
