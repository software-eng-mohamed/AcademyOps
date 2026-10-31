import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlgApiClient } from '../src/client.js';
import { PlgApiError } from '../src/errors.js';

afterEach(() => vi.unstubAllGlobals());

describe('Student certificate runtime validation', () => {
  const client = new PlgApiClient({ baseUrl: 'http://localhost:3001/api/v1' });

  async function expectCertificates(payload: unknown, shouldSucceed: boolean) {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 })),
    );
    if (shouldSucceed) {
      await expect(client.listCertificates({ limit: 1 })).resolves.toEqual(payload);
    } else {
      await expect(client.listCertificates({ limit: 1 })).rejects.toBeInstanceOf(PlgApiError);
    }
    vi.unstubAllGlobals();
  }

  async function expectEligibility(payload: unknown, shouldSucceed: boolean) {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 })),
    );
    if (shouldSucceed) {
      await expect(client.getCertificateEligibility('enroll-1')).resolves.toEqual(payload);
    } else {
      await expect(client.getCertificateEligibility('enroll-1')).rejects.toBeInstanceOf(
        PlgApiError,
      );
    }
    vi.unstubAllGlobals();
  }

  it('requires a canonical certificate pdfStatus', async () => {
    const validCertificate = {
      id: 'cert-1',
      serial: 'PLG-CERT-2026-000001',
      enrollmentId: 'enroll-1',
      validityStatus: 'ISSUED',
      issuedAt: '2026-08-10T11:00:00.000Z',
      pdfStatus: 'AVAILABLE',
    };
    const missingPdfStatus = {
      id: validCertificate.id,
      serial: validCertificate.serial,
      enrollmentId: validCertificate.enrollmentId,
      validityStatus: validCertificate.validityStatus,
      issuedAt: validCertificate.issuedAt,
    };

    await expectCertificates({ items: [validCertificate], nextCursor: null }, true);
    await expectCertificates(
      {
        items: [{ ...validCertificate, pdfStatus: 'PENDING_UPLOAD' }],
        nextCursor: null,
      },
      true,
    );
    await expectCertificates({ items: [missingPdfStatus], nextCursor: null }, false);
    await expectCertificates(
      { items: [{ ...validCertificate, pdfStatus: 'DOWNLOADED' }], nextCursor: null },
      false,
    );
  });

  it('rejects contradictory certificate eligibility responses', async () => {
    const valid = {
      attendanceRatio: '0.8500',
      minimumRatio: '0.8000',
      academicEligibility: 'ELIGIBLE',
      financialHold: false,
      outstanding: '0.00',
      completionSatisfied: true,
      overallEligibility: true,
      ruleId: 'rule-1',
    };

    await expectEligibility({ ...valid, completionSatisfied: false }, true);
    await expectEligibility({ ...valid, attendanceRatio: '1.0500' }, false);
    await expectEligibility({ ...valid, attendanceRatio: '-0.0500' }, false);
    await expectEligibility({ ...valid, minimumRatio: '0.7500' }, false);
    await expectEligibility({ ...valid, minimumRatio: '1.2000' }, false);
    await expectEligibility({ ...valid, outstanding: '-10.00' }, false);
    await expectEligibility(
      { ...valid, attendanceRatio: '0.7900', academicEligibility: 'ELIGIBLE' },
      false,
    );
    await expectEligibility(
      {
        ...valid,
        attendanceRatio: '0.8000',
        academicEligibility: 'INELIGIBLE',
        overallEligibility: false,
      },
      false,
    );
    await expectEligibility({ ...valid, outstanding: '10.00' }, false);
    await expectEligibility(
      { ...valid, financialHold: true, outstanding: '0.00', overallEligibility: false },
      false,
    );
    await expectEligibility(
      {
        ...valid,
        attendanceRatio: '0.7500',
        academicEligibility: 'INELIGIBLE',
        overallEligibility: true,
      },
      false,
    );
    await expectEligibility(
      { ...valid, financialHold: true, outstanding: '20.00', overallEligibility: true },
      false,
    );
  });
});
