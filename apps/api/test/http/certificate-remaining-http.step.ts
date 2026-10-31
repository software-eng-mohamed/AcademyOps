import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { BusinessFixture } from './business-chain-fixture';
import { get, post } from './finance-http-client';
import type { HttpTestContext } from './http-test-harness';

const cleanPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');

export async function runCertificateRemainingStep(
  context: HttpTestContext,
  fixture: BusinessFixture,
  enrollmentId: string,
): Promise<void> {
  await exerciseRules(context, fixture);
  const revoked = await context.prisma.certificate.findFirstOrThrow({
    where: {
      organizationId: context.organizationId,
      enrollmentId,
      validityStatus: 'REVOKED',
    },
  });
  const reissueKey = `reissue-${randomUUID()}`;
  const reissuedResponse = await post(
    context,
    `certificates/${revoked.id}/reissue`,
    { reason: 'Controlled replacement after verified revocation' },
    { 'idempotency-key': reissueKey },
  );
  assert.equal(reissuedResponse.status, 201, await reissuedResponse.clone().text());
  const reissued = (await reissuedResponse.json()) as { id: string; version: number };
  assert.equal(reissued.version, 1);
  const reissueReplay = await post(
    context,
    `certificates/${revoked.id}/reissue`,
    { reason: 'Controlled replacement after verified revocation' },
    { 'idempotency-key': reissueKey },
  );
  assert.equal(reissueReplay.status, 201);
  assert.deepEqual(await reissueReplay.json(), reissued);

  const form = new FormData();
  form.append('file', new Blob([cleanPdf], { type: 'application/pdf' }), 'certificate.pdf');
  const uploadKey = `upload-${randomUUID()}`;
  const uploadedResponse = await fetch(
    `${context.baseUrl}/api/v1/certificates/${reissued.id}/file`,
    {
      method: 'POST',
      headers: {
        ...context.unsafeHeaders,
        'if-match': '1',
        'idempotency-key': uploadKey,
      },
      body: form,
    },
  );
  assert.equal(uploadedResponse.status, 201, await uploadedResponse.clone().text());
  const uploaded = (await uploadedResponse.json()) as {
    fileAssetId: string;
    pdfStatus: string;
    version: number;
  };
  assert.equal(uploaded.pdfStatus, 'AVAILABLE');
  assert.equal(uploaded.version, 2);
  const replayForm = new FormData();
  replayForm.append('file', new Blob([cleanPdf], { type: 'application/pdf' }), 'certificate.pdf');
  const uploadReplay = await fetch(`${context.baseUrl}/api/v1/certificates/${reissued.id}/file`, {
    method: 'POST',
    headers: {
      ...context.unsafeHeaders,
      'if-match': '1',
      'idempotency-key': uploadKey,
    },
    body: replayForm,
  });
  assert.equal(uploadReplay.status, 201, await uploadReplay.clone().text());
  assert.deepEqual(await uploadReplay.json(), uploaded);
  const attempts = await context.prisma.$queryRaw<Array<{ id: string; status: string }>>`
    SELECT id::text, status
    FROM certificate_file_upload_attempts
    WHERE organization_id = ${context.organizationId}::uuid
      AND certificate_id = ${reissued.id}::uuid
  `;
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0]?.status, 'CLEAN');
  const uploadAttemptId = attempts[0]?.id;
  assert.ok(uploadAttemptId);
  const immutableAsset = await context.prisma.fileAsset.findUniqueOrThrow({
    where: { id: uploaded.fileAssetId },
  });
  assert.equal(immutableAsset.scanStatus, 'CLEAN');
  await assertDatabaseRejects(
    context,
    'asset_update_guard',
    () => context.prisma.$executeRaw`
      UPDATE file_assets SET content_type = 'application/octet-stream'
      WHERE id = ${uploaded.fileAssetId}::uuid
    `,
    /file_assets is append-only/,
  );
  await assertDatabaseRejects(
    context,
    'asset_delete_guard',
    () => context.prisma.$executeRaw`
      DELETE FROM file_assets WHERE id = ${uploaded.fileAssetId}::uuid
    `,
    /file_assets is append-only/,
  );
  await assertDatabaseRejects(
    context,
    'attempt_identity_guard',
    () => context.prisma.$executeRaw`
      UPDATE certificate_file_upload_attempts SET sha256 = repeat('0', 64)
      WHERE id = ${uploadAttemptId}::uuid
    `,
    /Certificate upload attempt identity is immutable/,
  );
  await assertDatabaseRejects(
    context,
    'attempt_terminal_guard',
    () => context.prisma.$executeRaw`
      UPDATE certificate_file_upload_attempts
      SET status = 'FAILED', completed_at = now(), updated_at = now()
      WHERE id = ${uploadAttemptId}::uuid
    `,
    /Invalid certificate upload attempt transition/,
  );

  const downloadResponse = await get(context, `certificates/${reissued.id}/download`);
  assert.equal(downloadResponse.status, 200, await downloadResponse.clone().text());
  const download = (await downloadResponse.json()) as { url: string; expiresAt: string };
  assert.equal(Date.parse(download.expiresAt) > Date.now(), true);
  const signed = new URL(download.url);
  const content = await fetch(`${context.baseUrl}${signed.pathname}${signed.search}`);
  assert.equal(content.status, 200, await content.clone().text());
  assert.deepEqual(Buffer.from(await content.arrayBuffer()), cleanPdf);

  let version = 2;
  for (const [command, expected] of [
    ['print', 'PRINTED'],
    ['ready', 'READY_FOR_COLLECTION'],
    ['collect', 'COLLECTED'],
  ] as const) {
    const key = `certificate-${command}-${randomUUID()}`;
    const response = await post(context, `certificates/${reissued.id}/${command}`, undefined, {
      'if-match': String(version),
      'idempotency-key': key,
    });
    assert.equal(response.status, 201, await response.clone().text());
    const result = (await response.json()) as { fulfillmentStatus: string; version: number };
    assert.equal(result.fulfillmentStatus, expected);
    assert.equal(result.version, version + 1);
    if (command === 'print') {
      const replay = await post(context, `certificates/${reissued.id}/${command}`, undefined, {
        'if-match': String(version),
        'idempotency-key': key,
      });
      assert.equal(replay.status, 201);
      assert.deepEqual(await replay.json(), result);
    }
    version = result.version;
  }
  const stored = await context.prisma.certificate.findUniqueOrThrow({
    where: { id: reissued.id },
  });
  assert.equal(stored.fulfillmentStatus, 'COLLECTED');
  assert.equal(stored.version, 5);
}

async function exerciseRules(context: HttpTestContext, fixture: BusinessFixture): Promise<void> {
  const key = `certificate-rule-${randomUUID()}`;
  const body = {
    programVersionId: fixture.programVersionId,
    cohortId: fixture.cohortId,
    minimumRatio: 0.9,
    effectiveFrom: new Date(Date.now() + 2 * 86_400_000).toISOString(),
  };
  const created = await post(context, 'certificate-rules', body, { 'idempotency-key': key });
  assert.equal(created.status, 201, await created.clone().text());
  const rule = (await created.json()) as { id: string; version: number };
  assert.equal(rule.version, 2);
  const replay = await post(context, 'certificate-rules', body, { 'idempotency-key': key });
  assert.equal(replay.status, 201);
  assert.deepEqual(await replay.json(), rule);
  const listed = await get(
    context,
    `certificate-rules?programVersionId=${fixture.programVersionId}&cohortId=${fixture.cohortId}`,
  );
  assert.equal(listed.status, 200, await listed.clone().text());
  assert.equal(
    ((await listed.json()) as { items: Array<{ id: string }> }).items.some(
      ({ id }) => id === rule.id,
    ),
    true,
  );
}

export function assertDeterministicCleanPdfScan(bytes: Buffer): Promise<void> {
  assert.deepEqual(bytes, cleanPdf);
  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal(bytes.includes(Buffer.from('%%EOF')), true);
  return Promise.resolve();
}

async function assertDatabaseRejects(
  context: HttpTestContext,
  savepoint: string,
  operation: () => Promise<unknown>,
  expected: RegExp,
): Promise<void> {
  assert.match(savepoint, /^[a-z_]+$/);
  await context.prisma.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
  let failure: unknown;
  try {
    await operation();
  } catch (error) {
    failure = error;
  } finally {
    await context.prisma.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await context.prisma.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
  }
  assert.ok(failure, `Expected ${savepoint} mutation to be rejected`);
  const message =
    failure instanceof Error
      ? `${failure.name}: ${failure.message}`
      : typeof failure === 'string'
        ? failure
        : (JSON.stringify(failure) ?? 'unknown failure');
  assert.match(message, expected);
}
