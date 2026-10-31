import { describe, it, expect, vi } from 'vitest';
import type { AccessContext } from '@academyops/contracts';
import { FinanceReadService } from '../src/finance/finance-read.service';
import type { FinancePaymentReadService } from '../src/finance/finance-payment-read.service';
import type { FinanceInvoiceReadService } from '../src/finance/finance-invoice-read.service';
import type { FinanceReceiptReadService } from '../src/finance/finance-receipt-read.service';
import type { FinanceBalanceReadService } from '../src/finance/finance-balance-read.service';
import type {
  AgingReportDto,
  ListInvoicesDto,
  ListPaymentsDto,
  ListReceiptsDto,
  PaymentMethodMixDto,
} from '../src/finance/finance.dto';

function createMockReadFacade(overrides: {
  paymentRead?: Partial<FinancePaymentReadService>;
  invoiceRead?: Partial<FinanceInvoiceReadService>;
  receiptRead?: Partial<FinanceReceiptReadService>;
  balanceRead?: Partial<FinanceBalanceReadService>;
}): FinanceReadService {
  return new FinanceReadService(
    (overrides.paymentRead ?? {}) as FinancePaymentReadService,
    (overrides.invoiceRead ?? {}) as FinanceInvoiceReadService,
    (overrides.receiptRead ?? {}) as FinanceReceiptReadService,
    (overrides.balanceRead ?? {}) as FinanceBalanceReadService,
  );
}

describe('FinanceReadService Facade Delegation', () => {
  const access: AccessContext = {
    organizationId: 'org-id',
    actorUserId: 'actor-id',
    permissions: [],
  };

  it('delegates paymentMethods to FinancePaymentReadService', async () => {
    const paymentMethods = vi.fn().mockResolvedValue([{ id: 'pm-1', code: 'CASH' }]);
    const facade = createMockReadFacade({ paymentRead: { paymentMethods } });

    const result = await facade.paymentMethods(access);

    expect(paymentMethods).toHaveBeenCalledWith(access);
    expect(result).toEqual([{ id: 'pm-1', code: 'CASH' }]);
  });

  it('delegates listPayments to FinancePaymentReadService', async () => {
    const listPayments = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const facade = createMockReadFacade({ paymentRead: { listPayments } });
    const input: ListPaymentsDto = { limit: 10 };

    const result = await facade.listPayments(access, input);

    expect(listPayments).toHaveBeenCalledWith(access, input);
    expect(result).toEqual({ items: [], nextCursor: null });
  });

  it('delegates paymentMethodMix to FinancePaymentReadService', async () => {
    const paymentMethodMix = vi.fn().mockResolvedValue({ items: [], totalAmount: '0.00' });
    const facade = createMockReadFacade({ paymentRead: { paymentMethodMix } });
    const input: PaymentMethodMixDto = {};

    const result = await facade.paymentMethodMix(access, input);

    expect(paymentMethodMix).toHaveBeenCalledWith(access, input);
    expect(result).toEqual({ items: [], totalAmount: '0.00' });
  });

  it('delegates readPayment to FinancePaymentReadService', async () => {
    const readPayment = vi.fn().mockResolvedValue({ id: 'payment-id' });
    const facade = createMockReadFacade({ paymentRead: { readPayment } });

    const result = await facade.readPayment(access, 'payment-id');

    expect(readPayment).toHaveBeenCalledWith(access, 'payment-id');
    expect(result).toEqual({ id: 'payment-id' });
  });

  it('delegates listInvoices to FinanceInvoiceReadService', async () => {
    const listInvoices = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const facade = createMockReadFacade({ invoiceRead: { listInvoices } });
    const input: ListInvoicesDto = { limit: 10 };

    const result = await facade.listInvoices(access, input);

    expect(listInvoices).toHaveBeenCalledWith(access, input);
    expect(result).toEqual({ items: [], nextCursor: null });
  });

  it('delegates readInvoice to FinanceInvoiceReadService', async () => {
    const readInvoice = vi.fn().mockResolvedValue({ id: 'invoice-id' });
    const facade = createMockReadFacade({ invoiceRead: { readInvoice } });

    const result = await facade.readInvoice(access, 'invoice-id');

    expect(readInvoice).toHaveBeenCalledWith(access, 'invoice-id');
    expect(result).toEqual({ id: 'invoice-id' });
  });

  it('delegates listReceipts to FinanceReceiptReadService', async () => {
    const listReceipts = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const facade = createMockReadFacade({ receiptRead: { listReceipts } });
    const input: ListReceiptsDto = { limit: 10 };

    const result = await facade.listReceipts(access, input);

    expect(listReceipts).toHaveBeenCalledWith(access, input);
    expect(result).toEqual({ items: [], nextCursor: null });
  });

  it('delegates readReceipt to FinanceReceiptReadService', async () => {
    const readReceipt = vi.fn().mockResolvedValue({ id: 'receipt-id' });
    const facade = createMockReadFacade({ receiptRead: { readReceipt } });

    const result = await facade.readReceipt(access, 'receipt-id');

    expect(readReceipt).toHaveBeenCalledWith(access, 'receipt-id');
    expect(result).toEqual({ id: 'receipt-id' });
  });

  it('delegates billingSummary to FinanceBalanceReadService', async () => {
    const billingSummary = vi.fn().mockResolvedValue({ balance: '100.00' });
    const facade = createMockReadFacade({ balanceRead: { billingSummary } });

    const result = await facade.billingSummary(access, 'billing-id');

    expect(billingSummary).toHaveBeenCalledWith(access, 'billing-id');
    expect(result).toEqual({ balance: '100.00' });
  });

  it('delegates enrollmentSummary to FinanceBalanceReadService', async () => {
    const enrollmentSummary = vi.fn().mockResolvedValue({ balance: '50.00' });
    const facade = createMockReadFacade({ balanceRead: { enrollmentSummary } });

    const result = await facade.enrollmentSummary(access, 'enrollment-id');

    expect(enrollmentSummary).toHaveBeenCalledWith(access, 'enrollment-id');
    expect(result).toEqual({ balance: '50.00' });
  });

  it('delegates aging to FinanceBalanceReadService', async () => {
    const aging = vi.fn().mockResolvedValue({ totals: {} });
    const facade = createMockReadFacade({ balanceRead: { aging } });
    const input: AgingReportDto = {};

    const result = await facade.aging(access, input);

    expect(aging).toHaveBeenCalledWith(access, input);
    expect(result).toEqual({ totals: {} });
  });

  it('propagates errors thrown from delegate providers', async () => {
    const testError = new Error('Test error');
    const readPayment = vi.fn().mockRejectedValue(testError);
    const facade = createMockReadFacade({ paymentRead: { readPayment } });

    await expect(facade.readPayment(access, 'payment-id')).rejects.toThrow(testError);
  });
});
