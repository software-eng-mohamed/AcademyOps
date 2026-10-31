import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlgApiClient } from '../src/client.js';
import { PlgApiError } from '../src/errors.js';

afterEach(() => vi.unstubAllGlobals());

describe('PlgApiClient student self-service runtime validation', () => {
  const client = new PlgApiClient({ baseUrl: 'http://localhost:3001/api/v1' });

  const installment = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    ordinal: 1,
    dueDate: '2026-08-10',
    originalAmount: '100.00',
    allocatedAmount: '0.00',
    outstandingAmount: '100.00',
    currency: 'EGP',
    state: 'DUE',
    payable: true,
  };

  it('accepts a complete installments page and rejects invalid payloads', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [installment], nextCursor: null }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ items: [{ ...installment, state: 'INVALID_STATE' }], nextCursor: null }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ items: [{ ...installment, dueDate: '2026-02-30' }], nextCursor: null }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ items: [{ ...installment, ordinal: -5 }], nextCursor: null }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ items: [{ ...installment, currency: 'EG' }], nextCursor: null }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [{ ...installment, payable: 'not-a-boolean' }],
            nextCursor: null,
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    // Valid call
    await expect(client.getEnrollmentInstallments('enroll-1')).resolves.toEqual({
      items: [installment],
      nextCursor: null,
    });
    // Invalid state
    await expect(client.getEnrollmentInstallments('enroll-1')).rejects.toBeInstanceOf(PlgApiError);
    // Impossible date
    await expect(client.getEnrollmentInstallments('enroll-1')).rejects.toBeInstanceOf(PlgApiError);
    // Negative ordinal
    await expect(client.getEnrollmentInstallments('enroll-1')).rejects.toBeInstanceOf(PlgApiError);
    // Two-letter currency
    await expect(client.getEnrollmentInstallments('enroll-1')).rejects.toBeInstanceOf(PlgApiError);
    // Non-boolean payable
    await expect(client.getEnrollmentInstallments('enroll-1')).rejects.toBeInstanceOf(PlgApiError);
  });

  it('accepts complete certificate eligibility responses and rejects invalid ones', async () => {
    const eligibility = {
      attendanceRatio: '0.8500',
      minimumRatio: '0.8000',
      academicEligibility: 'ELIGIBLE',
      financialHold: false,
      outstanding: '0.00',
      completionSatisfied: true,
      overallEligibility: true,
      ruleId: 'rule-1',
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(eligibility), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...eligibility, overallEligibility: undefined }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...eligibility, academicEligibility: 'NO_RULE' }), {
          status: 200,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(client.getCertificateEligibility('enroll-1')).resolves.toEqual(eligibility);
    await expect(client.getCertificateEligibility('enroll-1')).rejects.toBeInstanceOf(PlgApiError);
    await expect(client.getCertificateEligibility('enroll-1')).rejects.toBeInstanceOf(PlgApiError);
  });

  it('validates secure HTTPS URLs for certificate download and rejects HTTP or invalid URLs', async () => {
    const validDownload = {
      url: 'https://storage.example.com/certs/mycert.pdf?signature=123',
      expiresAt: '2026-08-10T11:00:00.000Z',
    };
    const invalidDownload = {
      url: 'http://storage.example.com/certs/mycert.pdf?signature=123',
      expiresAt: '2026-08-10T11:00:00.000Z',
    };
    const missingMillisExpires = {
      url: 'https://storage.example.com/certs/mycert.pdf?signature=123',
      expiresAt: '2026-08-10T11:00:00Z',
    };
    const localOffsetExpires = {
      url: 'https://storage.example.com/certs/mycert.pdf?signature=123',
      expiresAt: '2026-08-10T11:00:00.000+02:00',
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(validDownload), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(invalidDownload), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(missingMillisExpires), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(localOffsetExpires), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(client.downloadCertificate('cert-1')).resolves.toEqual(validDownload);
    await expect(client.downloadCertificate('cert-1')).rejects.toBeInstanceOf(PlgApiError);
    await expect(client.downloadCertificate('cert-1')).rejects.toBeInstanceOf(PlgApiError);
    await expect(client.downloadCertificate('cert-1')).rejects.toBeInstanceOf(PlgApiError);
  });

  it('sends the exact stable idempotency key on createPaymobCheckout', async () => {
    const result = {
      attemptId: 'attempt-1',
      status: 'PENDING',
      amount: '100.00',
      currencyCode: 'EGP',
      checkoutUrl: 'https://paymob.com/checkout/123',
      paymentId: null,
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(result), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const idempotencyKey = 'stable-key-1234';
    await client.createPaymobCheckout('inst-123', idempotencyKey);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.headers).toMatchObject({
      'idempotency-key': idempotencyKey,
    });
  });
});
