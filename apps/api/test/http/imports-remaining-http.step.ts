import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createImportWorkbook } from '../postgres/import-test-workbook';
import type { HttpTestContext } from './http-test-harness';

export async function runImportsRemainingStep(context: HttpTestContext): Promise<void> {
  const resolvable = await stageInvalid(context, 'RESOLVE');
  const issueResponse = await fetch(
    `${context.baseUrl}/api/v1/imports/batches/${resolvable}/issues?status=OPEN&limit=100`,
    { headers: context.safeHeaders },
  );
  assert.equal(issueResponse.status, 200, await issueResponse.clone().text());
  const issues = (await issueResponse.json()) as {
    items: Array<{
      id: string;
      importRowId: string | null;
      code: string;
      details: { ruleVersion?: number } | null;
      row: { rowHash: string } | null;
    }>;
  };
  const issue = issues.items.find(({ importRowId }) => Boolean(importRowId));
  assert.ok(issue);
  assert.ok(issue.row);
  const rejectedLegacyPayload = await fetch(
    `${context.baseUrl}/api/v1/imports/batches/${resolvable}/issues/${issue.id}`,
    {
      method: 'PATCH',
      headers: { ...context.unsafeHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({
        disposition: 'ARCHIVED',
        note: 'Legacy unbound resolution must be rejected',
      }),
    },
  );
  assert.equal(rejectedLegacyPayload.status, 400);
  const resolved = await fetch(
    `${context.baseUrl}/api/v1/imports/batches/${resolvable}/issues/${issue.id}`,
    {
      method: 'PATCH',
      headers: { ...context.unsafeHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({
        schemaVersion: 'plg-import-correction/v1',
        decision: 'EXCLUDE',
        expectedRowHash: issue.row.rowHash,
        expectedIssueCode: issue.code,
        expectedIssueVersion: issue.details?.ruleVersion ?? 1,
        note: 'Owner verified the legacy row cannot be safely normalized',
      }),
    },
  );
  assert.equal(resolved.status, 200, await resolved.clone().text());
  assert.equal(((await resolved.json()) as { status: string }).status, 'RESOLVED');
  const resolvedRow = await context.prisma.importRow.findUniqueOrThrow({
    where: { id: issue.importRowId! },
  });
  assert.deepEqual(resolvedRow.rawValues, { archived: true });
  assert.equal(resolvedRow.normalizedValues, null);
  const retained = await context.prisma.legacyArchiveRecord.findFirst({
    where: {
      organizationId: context.organizationId,
      batchId: resolvable,
      sourceFileId: resolvedRow.sourceFileId,
      sheetName: resolvedRow.sheetName,
      rowNumber: resolvedRow.rowNumber,
    },
  });
  assert.ok(retained, 'Resolving to ARCHIVED must retain a readable archive record');
  const retainedResponse = await fetch(`${context.baseUrl}/api/v1/legacy-archive/${retained.id}`, {
    headers: context.safeHeaders,
  });
  assert.equal(retainedResponse.status, 200, await retainedResponse.clone().text());
  const retainedBody = (await retainedResponse.json()) as { data: unknown };
  assert.match(JSON.stringify(retainedBody.data), /Quarantined Student/);

  const archivable = await stageInvalid(context, 'ARCHIVE');
  const key = `archive-${randomUUID()}`;
  const body = { note: 'Owner approved encrypted archival of quarantined legacy rows' };
  const archived = await archive(context, archivable, key, body);
  assert.equal(archived.status, 201, await archived.clone().text());
  const result = (await archived.json()) as {
    archivedRows: number;
    remainingOpenIssues: number;
  };
  assert.equal(result.archivedRows > 0, true);
  assert.equal(result.remainingOpenIssues, 0);
  const replay = await archive(context, archivable, key, body);
  assert.equal(replay.status, 201);
  assert.deepEqual(await replay.json(), result);
  assert.equal(
    (await context.prisma.legacyArchiveRecord.count({
      where: { organizationId: context.organizationId, batchId: archivable },
    })) >= result.archivedRows,
    true,
  );
}

async function stageInvalid(context: HttpTestContext, label: string): Promise<string> {
  const legacyCode = `${label[0]}${randomUUID().replaceAll('-', '').slice(0, 8)}`;
  const form = new FormData();
  form.append(
    'file',
    new Blob([createImportWorkbook(legacyCode, { invalidMaster: true })], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `${label.toLowerCase()}.xlsx`,
  );
  const staged = await fetch(`${context.baseUrl}/api/v1/imports/batches`, {
    method: 'POST',
    headers: context.unsafeHeaders,
    body: form,
  });
  assert.equal(staged.status, 201, await staged.clone().text());
  const id = ((await staged.json()) as { id: string }).id;
  const validated = await fetch(`${context.baseUrl}/api/v1/imports/batches/${id}/validate`, {
    method: 'POST',
    headers: context.unsafeHeaders,
  });
  assert.equal(validated.status, 201, await validated.clone().text());
  assert.equal(((await validated.json()) as { openIssues: number }).openIssues > 0, true);
  return id;
}

function archive(
  context: HttpTestContext,
  batchId: string,
  key: string,
  body: unknown,
): Promise<Response> {
  return fetch(`${context.baseUrl}/api/v1/imports/batches/${batchId}/archive-quarantined`, {
    method: 'POST',
    headers: {
      ...context.unsafeHeaders,
      'content-type': 'application/json',
      'idempotency-key': key,
    },
    body: JSON.stringify(body),
  });
}
