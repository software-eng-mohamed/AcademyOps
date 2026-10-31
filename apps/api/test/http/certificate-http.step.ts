import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { BusinessFixture } from './business-chain-fixture';
import { payOffEnrollment } from './business-chain-fixture';
import type { HttpTestContext } from './http-test-harness';

export async function runCertificateStep(
  context: HttpTestContext,
  fixture: BusinessFixture,
  enrollmentId: string,
  canRevoke = true,
): Promise<void> {
  await payOffEnrollment(context, enrollmentId);
  await context.prisma.certificateRuleVersion.create({
    data: {
      organizationId: context.organizationId,
      programVersionId: fixture.programVersionId,
      cohortId: fixture.cohortId,
      version: 1,
      minimumRatio: '0.8000',
      effectiveFrom: new Date(Date.now() - 86_400_000),
      createdBy: context.userId,
    },
  });

  const eligibility = await get(context, `certificates/enrollments/${enrollmentId}/eligibility`);
  assert.equal(eligibility.status, 200, await eligibility.clone().text());
  const eligible = (await eligibility.json()) as {
    overallEligibility: boolean;
    attendanceRatio: string;
    outstanding: string;
  };
  assert.deepEqual(eligible, {
    ...eligible,
    overallEligibility: true,
    attendanceRatio: '1.0000',
    outstanding: '0.00',
  });

  const evaluated = await post(context, 'certificates/evaluate', { enrollmentId });
  assert.equal(evaluated.status, 201, await evaluated.clone().text());
  const evaluation = (await evaluated.json()) as { academicResult: string; financialHold: boolean };
  assert.equal(evaluation.academicResult, 'ELIGIBLE');
  assert.equal(evaluation.financialHold, false);

  const issueKey = `issue-${randomUUID()}`;
  const issuedResponse = await post(
    context,
    'certificates/issue',
    { enrollmentId },
    { 'idempotency-key': issueKey },
  );
  assert.equal(issuedResponse.status, 201, await issuedResponse.clone().text());
  const issued = (await issuedResponse.json()) as {
    id: string;
    serial: string;
    verificationToken: string;
    validityStatus: string;
    version: number;
  };
  assert.equal(issued.validityStatus, 'ISSUED');
  assert.equal(issued.version, 1);
  const issueReplay = await post(
    context,
    'certificates/issue',
    { enrollmentId },
    { 'idempotency-key': issueKey },
  );
  assert.equal(issueReplay.status, 201);
  assert.deepEqual(await issueReplay.json(), issued);

  const read = await get(context, `certificates/${issued.id}`);
  assert.equal(read.status, 200);
  const detail = (await read.json()) as { id: string; serial: string };
  assert.equal(detail.id, issued.id);
  assert.equal(detail.serial, issued.serial);
  const list = await get(context, `certificates?enrollmentId=${enrollmentId}`);
  assert.equal(list.status, 200);
  const listed = (await list.json()) as { items: Array<{ id: string }> };
  assert.equal(
    listed.items.some(({ id }) => id === issued.id),
    true,
  );
  const evaluations = await get(context, `certificates/enrollments/${enrollmentId}/evaluations`);
  assert.equal(evaluations.status, 200);
  assert.equal(((await evaluations.json()) as { items: unknown[] }).items.length >= 2, true);

  const verified = await fetch(
    `${context.baseUrl}/api/v1/certificates/verify/${issued.verificationToken}`,
  );
  assert.equal(verified.status, 200, await verified.clone().text());
  const verification = (await verified.json()) as { serial: string; validityStatus: string };
  assert.equal(verification.serial, issued.serial);
  assert.equal(verification.validityStatus, 'ISSUED');
  const revokeKey = `revoke-${randomUUID()}`;
  const revoked = await post(
    context,
    `certificates/${issued.id}/revoke`,
    { reason: 'Controlled HTTP lifecycle revocation' },
    { 'if-match': '1', 'idempotency-key': revokeKey },
  );
  if (!canRevoke) {
    assert.equal(revoked.status, 403, await revoked.clone().text());
    return;
  }
  assert.equal(revoked.status, 201, await revoked.clone().text());
  const revokedBody = (await revoked.json()) as {
    id: string;
    validityStatus: string;
    version: number;
  };
  assert.deepEqual(revokedBody, { id: issued.id, validityStatus: 'REVOKED', version: 2 });
  const revokeReplay = await post(
    context,
    `certificates/${issued.id}/revoke`,
    { reason: 'Controlled HTTP lifecycle revocation' },
    { 'if-match': '1', 'idempotency-key': revokeKey },
  );
  assert.equal(revokeReplay.status, 201);
  assert.deepEqual(await revokeReplay.json(), revokedBody);
  const verifiedRevoked = await fetch(
    `${context.baseUrl}/api/v1/certificates/verify/${issued.verificationToken}`,
  );
  assert.equal(verifiedRevoked.status, 200);
  assert.equal(
    ((await verifiedRevoked.json()) as { validityStatus: string }).validityStatus,
    'REVOKED',
  );
  assert.equal(
    await context.prisma.certificate.count({
      where: { organizationId: context.organizationId, enrollmentId },
    }),
    1,
  );
}

function get(context: HttpTestContext, path: string): Promise<Response> {
  return fetch(`${context.baseUrl}/api/v1/${path}`, { headers: context.safeHeaders });
}

function post(
  context: HttpTestContext,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${context.baseUrl}/api/v1/${path}`, {
    method: 'POST',
    headers: { ...context.unsafeHeaders, ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
