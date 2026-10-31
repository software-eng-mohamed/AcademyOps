import { describe, it, expect, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { FinanceService } from '../src/finance/finance.service';
import type { FinancePaymentService } from '../src/finance/finance-payment.service';
import type { FinanceReversalService } from '../src/finance/finance-reversal.service';
import type { FinanceRefundService } from '../src/finance/finance-refund.service';
import type { FinanceInvoiceService } from '../src/finance/finance-invoice.service';
import type { FinanceInvoiceVoidService } from '../src/finance/finance-invoice-void.service';
import type { FinanceCreditNoteService } from '../src/finance/finance-credit-note.service';
import type { FinanceLedgerService } from '../src/finance/finance-ledger.service';
import type { CreateInvoiceDto, CreatePaymentDto } from '../src/finance/finance.dto';

function createMockFacade(overrides: {
  paymentService?: Partial<FinancePaymentService>;
  reversalService?: Partial<FinanceReversalService>;
  refundService?: Partial<FinanceRefundService>;
  invoiceService?: Partial<FinanceInvoiceService>;
  invoiceVoidService?: Partial<FinanceInvoiceVoidService>;
  creditNoteService?: Partial<FinanceCreditNoteService>;
  ledgerService?: Partial<FinanceLedgerService>;
}): FinanceService {
  return new FinanceService(
    (overrides.paymentService ?? {}) as FinancePaymentService,
    (overrides.reversalService ?? {}) as FinanceReversalService,
    (overrides.refundService ?? {}) as FinanceRefundService,
    (overrides.invoiceService ?? {}) as FinanceInvoiceService,
    (overrides.invoiceVoidService ?? {}) as FinanceInvoiceVoidService,
    (overrides.creditNoteService ?? {}) as FinanceCreditNoteService,
    (overrides.ledgerService ?? {}) as FinanceLedgerService,
  );
}

describe('FinanceService Facade Decomposition', () => {
  const access: AccessContext = {
    organizationId: 'org-id',
    actorUserId: 'actor-id',
    permissions: [],
  };

  const meta = { correlationId: 'corr-id', idempotencyKey: 'idem-key' };

  it('delegates createPayment to FinancePaymentService', async () => {
    const createPayment = vi
      .fn()
      .mockResolvedValue({ id: 'payment-id', status: 'POSTED', version: 1, receiptSerial: null });
    const facade = createMockFacade({ paymentService: { createPayment } });
    const input: CreatePaymentDto = {
      amount: '100.00',
      methodId: 'method-id',
      billingAccountId: 'billing-id',
      receivedAt: '2026-08-10',
    };
    const result = await facade.createPayment(access, input, meta);

    expect(createPayment).toHaveBeenCalledWith(access, input, meta);
    expect(result).toEqual({ id: 'payment-id', status: 'POSTED', version: 1, receiptSerial: null });
  });

  it('delegates postPayment to FinancePaymentService', async () => {
    const postPayment = vi
      .fn()
      .mockResolvedValue({ id: 'payment-id', status: 'POSTED', version: 2, receiptSerial: null });
    const facade = createMockFacade({ paymentService: { postPayment } });
    const result = await facade.postPayment(access, 'payment-id', 1, meta);

    expect(postPayment).toHaveBeenCalledWith(access, 'payment-id', 1, meta);
    expect(result).toEqual({ id: 'payment-id', status: 'POSTED', version: 2, receiptSerial: null });
  });

  it('delegates rejectPayment to FinancePaymentService', async () => {
    const rejectPayment = vi
      .fn()
      .mockResolvedValue({ id: 'payment-id', status: 'REJECTED', version: 2, receiptSerial: null });
    const facade = createMockFacade({ paymentService: { rejectPayment } });
    const result = await facade.rejectPayment(access, 'payment-id', 'reason', 1, meta);

    expect(rejectPayment).toHaveBeenCalledWith(access, 'payment-id', 'reason', 1, meta);
    expect(result).toEqual({
      id: 'payment-id',
      status: 'REJECTED',
      version: 2,
      receiptSerial: null,
    });
  });

  it('delegates requestReversal to FinanceReversalService', async () => {
    const requestReversal = vi.fn().mockResolvedValue({ id: 'request-id', status: 'PENDING' });
    const facade = createMockFacade({ reversalService: { requestReversal } });
    const result = await facade.requestReversal(access, 'payment-id', 'reason', meta);

    expect(requestReversal).toHaveBeenCalledWith(access, 'payment-id', 'reason', meta);
    expect(result).toEqual({ id: 'request-id', status: 'PENDING' });
  });

  it('delegates approveReversal to FinanceReversalService', async () => {
    const approveReversal = vi
      .fn()
      .mockResolvedValue({ id: 'payment-id', status: 'REVERSED', version: 2, receiptSerial: null });
    const facade = createMockFacade({ reversalService: { approveReversal } });
    const result = await facade.approveReversal(access, 'request-id', meta);

    expect(approveReversal).toHaveBeenCalledWith(access, 'request-id', meta);
    expect(result).toEqual({
      id: 'payment-id',
      status: 'REVERSED',
      version: 2,
      receiptSerial: null,
    });
  });

  it('delegates requestRefund to FinanceRefundService', async () => {
    const requestRefund = vi.fn().mockResolvedValue({ id: 'request-id', status: 'PENDING' });
    const facade = createMockFacade({ refundService: { requestRefund } });
    const result = await facade.requestRefund(access, 'payment-id', '50.00', 'reason', meta);

    expect(requestRefund).toHaveBeenCalledWith(access, 'payment-id', '50.00', 'reason', meta);
    expect(result).toEqual({ id: 'request-id', status: 'PENDING' });
  });

  it('delegates approveRefund to FinanceRefundService', async () => {
    const approveRefund = vi.fn().mockResolvedValue({ id: 'refund-id', amount: '50.00' });
    const facade = createMockFacade({ refundService: { approveRefund } });
    const result = await facade.approveRefund(access, 'request-id', meta);

    expect(approveRefund).toHaveBeenCalledWith(access, 'request-id', meta);
    expect(result).toEqual({ id: 'refund-id', amount: '50.00' });
  });

  it('delegates createInvoiceDraft to FinanceInvoiceService', async () => {
    const createInvoiceDraft = vi
      .fn()
      .mockResolvedValue({ id: 'invoice-id', status: 'DRAFT', version: 1 });
    const facade = createMockFacade({ invoiceService: { createInvoiceDraft } });
    const input: CreateInvoiceDto = { billingAccountId: 'billing-id', lines: [] };
    const result = await facade.createInvoiceDraft(access, input, meta);

    expect(createInvoiceDraft).toHaveBeenCalledWith(access, input, meta);
    expect(result).toEqual({ id: 'invoice-id', status: 'DRAFT', version: 1 });
  });

  it('delegates issueInvoice to FinanceInvoiceService', async () => {
    const issueInvoice = vi
      .fn()
      .mockResolvedValue({ id: 'invoice-id', status: 'ISSUED', serialNumber: '123', version: 2 });
    const facade = createMockFacade({ invoiceService: { issueInvoice } });
    const result = await facade.issueInvoice(access, 'invoice-id', 1, meta);

    expect(issueInvoice).toHaveBeenCalledWith(access, 'invoice-id', 1, meta);
    expect(result).toEqual({
      id: 'invoice-id',
      status: 'ISSUED',
      serialNumber: '123',
      version: 2,
    });
  });

  it('delegates voidInvoice to FinanceInvoiceVoidService', async () => {
    const voidInvoice = vi
      .fn()
      .mockResolvedValue({ id: 'invoice-id', status: 'VOIDED', serialNumber: '123', version: 2 });
    const facade = createMockFacade({ invoiceVoidService: { voidInvoice } });
    const result = await facade.voidInvoice(access, 'invoice-id', 'reason', 1, meta);

    expect(voidInvoice).toHaveBeenCalledWith(access, 'invoice-id', 'reason', 1, meta);
    expect(result).toEqual({
      id: 'invoice-id',
      status: 'VOIDED',
      serialNumber: '123',
      version: 2,
    });
  });

  it('delegates cancelInvoice to FinanceInvoiceVoidService', async () => {
    const cancelInvoice = vi.fn().mockResolvedValue({
      id: 'invoice-id',
      status: 'CANCELLED',
      serialNumber: null,
      version: 2,
    });
    const facade = createMockFacade({ invoiceVoidService: { cancelInvoice } });
    const result = await facade.cancelInvoice(access, 'invoice-id', 'reason', 1, meta);

    expect(cancelInvoice).toHaveBeenCalledWith(access, 'invoice-id', 'reason', 1, meta);
    expect(result).toEqual({
      id: 'invoice-id',
      status: 'CANCELLED',
      serialNumber: null,
      version: 2,
    });
  });

  it('delegates createCreditNote to FinanceCreditNoteService', async () => {
    const createCreditNote = vi
      .fn()
      .mockResolvedValue({ id: 'note-id', serialNumber: 'CN-123', amount: '100.00' });
    const facade = createMockFacade({ creditNoteService: { createCreditNote } });
    const result = await facade.createCreditNote(access, 'invoice-id', '100.00', 'reason', meta);

    expect(createCreditNote).toHaveBeenCalledWith(access, 'invoice-id', '100.00', 'reason', meta);
    expect(result).toEqual({ id: 'note-id', serialNumber: 'CN-123', amount: '100.00' });
  });

  it('delegates postPaymentLedger to FinanceLedgerService', async () => {
    const postPaymentLedger = vi.fn().mockResolvedValue(undefined);
    const facade = createMockFacade({ ledgerService: { postPaymentLedger } });
    const transaction = {} as Prisma.TransactionClient;
    await facade.postPaymentLedger(transaction, access, 'payment-id', 'installment-id');

    expect(postPaymentLedger).toHaveBeenCalledWith(
      transaction,
      access,
      'payment-id',
      'installment-id',
    );
  });
});
