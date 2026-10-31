import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlgApiClient } from '../src/client.js';
import { PlgApiError } from '../src/errors.js';

afterEach(() => vi.unstubAllGlobals());
describe('PlgApiClient finance runtime validation', () => {
  const client = new PlgApiClient({ baseUrl: 'http://localhost:3001/api/v1' });
  it('accepts complete payment methods and rejects incomplete records', async () => {
    const method = {
      id: 'method-1',
      code: 'CASH',
      name: 'Cash',
      verificationRequired: false,
      isActive: true,
      createdAt: '2026-08-10T10:00:00.000Z',
      updatedAt: '2026-08-10T10:00:00.000Z',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([method]), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ ...method, updatedAt: undefined }]), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    await expect(client.paymentMethods()).resolves.toEqual([method]);
    await expect(client.paymentMethods()).rejects.toBeInstanceOf(PlgApiError);
  });
  it('accepts a complete payment page and rejects incomplete payment records', async () => {
    const payment = {
      id: 'payment-1',
      billingAccountId: 'billing-1',
      enrollmentId: 'enrollment-1',
      ledgerEntryId: null,
      methodId: 'method-1',
      method: {
        id: 'method-1',
        code: 'CASH',
        name: 'Cash',
      },
      status: 'POSTED',
      amount: '100.00',
      currencyCode: 'EGP',
      externalReference: null,
      idempotencyKey: 'idem-1',
      receivedAt: '2026-08-10T10:00:00.000Z',
      postedAt: '2026-08-10T10:00:01.000Z',
      createdBy: 'user-1',
      version: 1,
      createdAt: '2026-08-10T10:00:00.000Z',
      updatedAt: '2026-08-10T10:00:01.000Z',
      refundedAmount: '0.00',
      refundStatus: 'NONE',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [payment], nextCursor: null }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ items: [{ ...payment, refundedAmount: undefined }], nextCursor: null }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    await expect(client.listPayments({ limit: 20 })).resolves.toMatchObject({ items: [payment] });
    await expect(client.listPayments({ limit: 20 })).rejects.toBeInstanceOf(PlgApiError);
  });
  it('reads and validates posted payment method percentages', async () => {
    const mix = {
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
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(mix), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(client.paymentMethodMix('branch-1')).resolves.toEqual(mix);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/payments/method-mix?branchId=branch-1',
    );
  });
  it('submits refund and reversal requests with idempotency keys', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ id: 'request-1', paymentId: 'payment-1', status: 'PENDING' }),
            { status: 200 },
          ),
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    await client.requestPaymentRefund('payment-1', '25.00', 'Duplicate payment', 'refund-key');
    await client.requestPaymentReversal('payment-1', 'Bank reversal', 'reversal-key');
    const [refundUrl, refundInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [reversalUrl, reversalInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(refundUrl).toContain('/payments/payment-1/refund-requests');
    expect(refundInit.headers).toMatchObject({ 'Idempotency-Key': 'refund-key' });
    expect(JSON.parse(String(refundInit.body))).toEqual({
      amount: '25.00',
      reason: 'Duplicate payment',
    });
    expect(reversalUrl).toContain('/payments/payment-1/reversal-requests');
    expect(reversalInit.headers).toMatchObject({ 'Idempotency-Key': 'reversal-key' });
  });
  it('creates, lists and downloads sensitive report exports through explicit endpoints', async () => {
    const job = {
      id: 'export-1',
      reportType: 'FINANCE_RECEIVABLES',
      status: 'AVAILABLE',
      version: 2,
      parameters: { branchId: 'branch-1', asOf: '2026-08-22' },
      fileAssetId: 'file-1',
      errorMessage: null,
      createdAt: '2026-08-22T10:00:00.000Z',
      startedAt: '2026-08-22T10:00:01.000Z',
      completedAt: '2026-08-22T10:00:02.000Z',
      expiresAt: '2026-08-23T10:00:00.000Z',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(job), { status: 202 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [job], nextCursor: null }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ url: 'http://localhost:3001/file.csv', expiresAt: job.expiresAt }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    await client.createFinanceReceivablesExport('branch-1', '2026-08-22', 'export-key');
    await expect(client.listReportExports(undefined, 25)).resolves.toMatchObject({ items: [job] });
    await expect(client.downloadReportExport('export-1')).resolves.toMatchObject({
      url: 'http://localhost:3001/file.csv',
    });
    const [createUrl, createInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(createUrl).toContain(
      '/reports/finance/receivables/exports?branchId=branch-1&asOf=2026-08-22',
    );
    expect(createInit.headers).toMatchObject({ 'Idempotency-Key': 'export-key' });
  });
});
