// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEMO_COOKIE } from '@/api/demo/cookie-state';
import { DEMO_EMAIL, DEMO_ORGANIZATION, DEMO_PASSWORD } from '@/api/demo/credentials';
import { demoCertificatePdf } from '@/api/demo/demo-pdf';
import { handleDemoRequest } from '@/api/demo/router';
import { demoId } from '@/api/demo/shared';

const origin = 'https://academyops.example';
async function visitor() {
  let cookie = '';
  const call = async (path: string, method = 'GET', body?: unknown, version?: number) => {
    const response = await handleDemoRequest(
      new Request(`${origin}/api/v1/${path}`, {
        method,
        headers: {
          cookie,
          origin,
          'Content-Type': 'application/json',
          ...(version === undefined ? {} : { 'If-Match': String(version) }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
    const saved = response.headers
      .getSetCookie()
      .find((item) => item.startsWith(`${DEMO_COOKIE}=`));
    if (saved) cookie = saved.split(';')[0] ?? '';
    return response;
  };
  await success(
    await call('auth/login', 'POST', {
      identifier: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      organizationCode: DEMO_ORGANIZATION,
    }),
  );
  return call;
}
async function success(response: Response) {
  expect(response.status, await response.clone().text()).toBeLessThan(400);
  return response.json();
}
async function error(response: Response, code: string) {
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code });
}

describe('synthetic certificates through the original API', () => {
  it('uses the original status, evaluation envelope, rule threshold and truthful completion fields', async () => {
    const call = await visitor();
    const list = await success(await call('certificates?validityStatus=ISSUED'));
    expect(list.items).toHaveLength(2);
    expect(list.items[0]).toMatchObject({
      validityStatus: 'ISSUED',
      fulfillmentStatus: 'NOT_PRINTED',
    });
    const evaluations = await success(
      await call(`certificates/enrollments/${demoId(300)}/evaluations`),
    );
    expect(evaluations.items).toHaveLength(1);
    expect(evaluations.items[0]).toMatchObject({
      academicResult: 'ELIGIBLE',
      attendanceRatio: '1.0000',
      evidenceSnapshot: { synthetic: true, completionSatisfied: false, minimumRatio: '0.8000' },
    });
    expect(
      await success(await call(`certificates/enrollments/${demoId(300)}/eligibility`)),
    ).toMatchObject({
      overallEligibility: true,
      completionSatisfied: false,
      outstanding: '0.00',
      minimumRatio: '0.8000',
    });
    expect(
      await success(await call(`certificates/enrollments/${demoId(311)}/eligibility`)),
    ).toMatchObject({
      attendanceRatio: null,
      academicEligibility: 'INELIGIBLE',
      overallEligibility: false,
    });
  });

  it('evaluates actual financial hold, then allows issuance after a local credit note settles it', async () => {
    const call = await visitor();
    const enrollmentId = demoId(302);
    const evaluated = await success(await call('certificates/evaluate', 'POST', { enrollmentId }));
    expect(evaluated).toMatchObject({
      academicResult: 'ELIGIBLE',
      financialHold: true,
      outstanding: '1500.00',
    });
    await error(
      await call('certificates/issue', 'POST', { enrollmentId }),
      'CERTIFICATE_FINANCIAL_HOLD',
    );
    await success(
      await call(`invoices/${demoId(2302)}/credit-notes`, 'POST', {
        amount: '1500.00',
        reason: 'Fictional tuition adjustment',
      }),
    );
    const enrollment = await success(await call(`enrollments/${enrollmentId}`));
    expect(enrollment.finance).toMatchObject({
      balance: '0.00',
      outstandingBalance: 0,
      totalCredits: '3000.00',
    });
    const issued = await success(await call('certificates/issue', 'POST', { enrollmentId }));
    expect(issued).toMatchObject({
      validityStatus: 'ISSUED',
      pdfStatus: 'AVAILABLE',
      supersedesId: null,
    });
    const repeated = await success(await call('certificates/issue', 'POST', { enrollmentId }));
    expect(repeated.id).toBe(issued.id);
    const download = await success(await call(`certificates/${issued.id}/download`));
    expect(download.url).toBe(`${origin}/api/v1/certificates/${issued.id}/file`);
    const file = await call(`certificates/${issued.id}/file`);
    expect(file.headers.get('content-type')).toBe('application/pdf');
    const content = await file.text();
    expect(content).toContain('FICTIONAL SAMPLE - NOT A QUALIFICATION');
    expect(content).toContain('No certificate has been issued by a real institution.');
    const other = await visitor();
    expect((await other(`certificates/${issued.id}`)).status).toBe(404);
  });

  it('supports print, ready, collect, revoke and reissue while retaining audit lineage and stale-write protection', async () => {
    const call = await visitor();
    const id = demoId(4300);
    await success(await call(`certificates/${id}/print`, 'POST', {}, 1));
    await error(await call(`certificates/${id}/ready`, 'POST', {}, 1), 'VERSION_CONFLICT');
    const ready = await success(await call(`certificates/${id}/ready`, 'POST', {}, 2));
    expect(ready.fulfillmentStatus).toBe('READY_FOR_COLLECTION');
    await success(await call(`certificates/${id}/collect`, 'POST', {}, 3));
    const revoked = await success(
      await call(`certificates/${id}/revoke`, 'POST', { reason: 'Fictional correction' }, 4),
    );
    expect(revoked).toMatchObject({
      validityStatus: 'REVOKED',
      fulfillmentStatus: 'COLLECTED',
      version: 5,
    });
    await error(await call(`certificates/${id}/download`), 'CERTIFICATE_NOT_ACTIVE');
    await error(
      await call('certificates/issue', 'POST', { enrollmentId: demoId(300) }),
      'CERTIFICATE_REISSUE_REQUIRED',
    );
    const replacement = await success(
      await call(`certificates/${id}/reissue`, 'POST', { reason: 'Fictional replacement' }),
    );
    expect(replacement).toMatchObject({
      supersedesId: id,
      validityStatus: 'ISSUED',
      fulfillmentStatus: 'NOT_PRINTED',
    });
    expect(replacement.id).not.toBe(id);
    expect(replacement.events[0].type).toBe('REISSUED');
    const original = await success(await call(`certificates/${id}`));
    expect(original.events.map((event: { type: string }) => event.type)).toEqual([
      'ISSUED',
      'FULFILLMENT_CHANGED',
      'FULFILLMENT_CHANGED',
      'FULFILLMENT_CHANGED',
      'REVOKED',
    ]);
    await error(
      await call(`certificates/${id}/reissue`, 'POST', { reason: 'Duplicate replacement' }),
      'CERTIFICATE_ALREADY_ACTIVE',
    );
  });

  it('rechecks attendance and refunds instead of trusting a historical eligible evaluation', async () => {
    const call = await visitor();
    const id = demoId(4300);
    await success(
      await call(
        `attendance/${demoId(1100)}/corrections`,
        'POST',
        { status: 'ABSENT', reason: 'Sample correction' },
        1,
      ),
    );
    const result = await success(await call(`certificates/enrollments/${demoId(300)}/eligibility`));
    expect(result).toMatchObject({
      attendanceRatio: '0.5000',
      academicEligibility: 'INELIGIBLE',
      overallEligibility: false,
    });
    await error(
      await call(`certificates/${id}/print`, 'POST', {}, 1),
      'CERTIFICATE_ACADEMIC_INELIGIBLE',
    );
    await error(await call(`certificates/${id}/file`), 'CERTIFICATE_ACADEMIC_INELIGIBLE');
    await success(
      await call(
        `attendance/${demoId(1100)}/corrections`,
        'POST',
        { status: 'PRESENT', reason: 'Sample correction' },
        2,
      ),
    );
    await success(await call(`refund-requests/${demoId(2800)}/approve`, 'POST', {}));
    await error(await call(`certificates/${id}/download`), 'CERTIFICATE_FINANCIAL_HOLD');
    expect((await success(await call(`enrollments/${demoId(300)}`))).finance.balance).toBe(
      '250.00',
    );
  });

  it('keeps the PDF fictional and escapes text that could alter PDF drawing commands', () => {
    const pdf = new TextDecoder().decode(
      demoCertificatePdf('DEMO-CERT-TEST', 'Sample (learner) \\ name'),
    );
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('Sample \\(learner\\) \\\\ name');
    expect(pdf).toContain('FICTIONAL SAMPLE - NOT A QUALIFICATION');
    expect(pdf.endsWith('%%EOF\n')).toBe(true);
    const xref = Number(pdf.match(/startxref\n(\d+)/)?.[1]);
    expect(pdf.slice(xref, xref + 4)).toBe('xref');
  });
});
