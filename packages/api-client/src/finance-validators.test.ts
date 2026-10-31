import { describe, expect, it } from 'vitest';
import {
  validateInvoicesPage,
  validatePaymentMethodMix,
  validatePaymobCheckoutStatus,
  validatePricingAgreementsPage,
  validateReceiptsPage,
} from './finance-validators.js';

describe('student finance document validators', () => {
  it('accepts canonical invoice, receipt and pricing pages', () => {
    expect(
      validatePricingAgreementsPage({
        items: [
          {
            id: 'p1',
            status: 'APPROVED',
            version: 1,
            lockVersion: 1,
            subtotal: '100.00',
            discountAmount: '0.00',
            totalAmount: '100.00',
            requiredApprovalTier: 1,
          },
        ],
        nextCursor: null,
      }).items,
    ).toHaveLength(1);
    expect(
      validateInvoicesPage({
        items: [
          {
            id: 'i1',
            status: 'ISSUED',
            fiscalYear: 2026,
            serialNumber: '1',
            currencyCode: 'EGP',
            subtotal: '100.00',
            taxAmount: '0.00',
            totalAmount: '100.00',
            billingAccountId: 'b1',
            version: 1,
            customerSnapshot: {},
            issuedAt: '2026-08-22T00:00:00.000Z',
            voidedAt: null,
            createdBy: 'u1',
            createdAt: '2026-08-22T00:00:00.000Z',
            updatedAt: '2026-08-22T00:00:00.000Z',
            settledAmount: '0.00',
            creditedAmount: '0.00',
            paymentStatus: 'UNPAID',
          },
        ],
        nextCursor: null,
      }).items,
    ).toHaveLength(1);
    expect(
      validateReceiptsPage({
        items: [
          {
            id: 'r1',
            paymentId: 'p1',
            billingAccountId: 'b1',
            fiscalYear: 2026,
            serialNumber: '1',
            amount: '100.00',
            currencyCode: 'EGP',
            payerSnapshot: {},
            issuedAt: '2026-08-22T00:00:00.000Z',
            createdBy: 'u1',
            createdAt: '2026-08-22T00:00:00.000Z',
            documentLabel: 'INTERNAL_RECEIPT',
          },
        ],
        nextCursor: null,
      }).items,
    ).toHaveLength(1);
  });
  it('rejects malformed financial documents', () => {
    expect(() => validateInvoicesPage({ items: [{ id: 'i1' }], nextCursor: null })).toThrow();
    expect(() => validateReceiptsPage({ items: [], nextCursor: 4 })).toThrow();
    expect(() =>
      validatePricingAgreementsPage({ items: [{ requiredApprovalTier: 3 }], nextCursor: null }),
    ).toThrow();
  });
  it('accepts only a server-confirmed Paymob attempt status', () => {
    expect(
      validatePaymobCheckoutStatus({
        attemptId: 'attempt-1',
        status: 'SUCCEEDED',
        amount: '4000.00',
        currencyCode: 'EGP',
        paymentId: 'payment-1',
        updatedAt: '2026-08-24T12:00:00.000Z',
      }),
    ).toMatchObject({ status: 'SUCCEEDED', paymentId: 'payment-1' });
    expect(() =>
      validatePaymobCheckoutStatus({
        attemptId: 'attempt-1',
        status: 'SUCCEEDED',
        amount: '4000.00',
        currencyCode: 'USD',
        paymentId: null,
        updatedAt: '2026-08-24T12:00:00.000Z',
      }),
    ).toThrow();
  });
  it('accepts a complete posted payment method mix', () => {
    expect(
      validatePaymentMethodMix({
        asOf: '2026-08-25T10:00:00.000Z',
        range: {
          from: '2026-03-01T00:00:00.000Z',
          toExclusive: '2026-09-01T00:00:00.000Z',
          fromMonth: '2026-03',
          toMonth: '2026-08',
          timeZone: 'Africa/Cairo',
        },
        currencyCode: 'EGP',
        totalAmount: '1000.00',
        totalPayments: 4,
        items: [
          {
            method: { id: 'method-1', code: 'CIB', name: 'CIB' },
            amount: '750.00',
            paymentCount: 3,
            percentage: 75,
          },
        ],
      }).items[0],
    ).toMatchObject({ amount: '750.00', percentage: 75 });
  });
});
