import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { createImportWorkbook } from '../postgres/import-test-workbook';
import { type HttpTestContext, runHttpScenario } from './http-test-harness';
export async function runImportsHttpScenario(): Promise<void> {
  await runHttpScenario(
    {
      permissions: [
        'imports.execute',
        'imports.preview',
        'imports.finalize',
        'legacy_archive.read',
      ],
    },
    async (context) => {
      const legacyCode = `H${randomUUID().replaceAll('-', '').slice(0, 8)}`;
      const form = new FormData();
      form.append(
        'file',
        new Blob([createImportWorkbook(legacyCode)], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        'academy.xlsx',
      );
      const stagedResponse = await fetch(`${context.baseUrl}/api/v1/imports/batches`, {
        method: 'POST',
        headers: context.unsafeHeaders,
        body: form,
      });
      assert.equal(stagedResponse.status, 201, await stagedResponse.clone().text());
      const staged = (await stagedResponse.json()) as {
        id: string;
        duplicate: boolean;
      };
      assert.equal(staged.duplicate, false);
      const list = await fetch(`${context.baseUrl}/api/v1/imports/batches?limit=10`, {
        headers: context.safeHeaders,
      });
      assert.equal(list.status, 200);
      const listBody = (await list.json()) as {
        items: Array<{
          id: string;
        }>;
      };
      assert.equal(
        listBody.items.some(({ id }) => id === staged.id),
        true,
      );
      const detail = await fetch(`${context.baseUrl}/api/v1/imports/batches/${staged.id}`, {
        headers: context.safeHeaders,
      });
      assert.equal(detail.status, 200);
      assert.equal(
        (
          (await detail.json()) as {
            id: string;
          }
        ).id,
        staged.id,
      );
      const issues = await fetch(
        `${context.baseUrl}/api/v1/imports/batches/${staged.id}/issues?limit=10`,
        { headers: context.safeHeaders },
      );
      assert.equal(issues.status, 200);
      assert.deepEqual(
        (
          (await issues.json()) as {
            items: unknown[];
          }
        ).items,
        [],
      );
      const missingCsrf = await fetch(
        `${context.baseUrl}/api/v1/imports/batches/${staged.id}/validate`,
        {
          method: 'POST',
          headers: {
            ...context.safeHeaders,
            origin: context.unsafeHeaders.origin,
          },
        },
      );
      assert.equal(missingCsrf.status, 403);
      assert.equal(
        (
          (await missingCsrf.json()) as {
            code: string;
          }
        ).code,
        'CSRF_TOKEN_INVALID',
      );
      const validated = await post(context, `${staged.id}/validate`);
      assert.equal(validated.status, 201, await validated.clone().text());
      const validatedBody = (await validated.json()) as {
        openIssues: number;
        dispositions: {
          READY: number;
        };
      };
      assert.equal(validatedBody.openIssues, 0);
      assert.equal(validatedBody.dispositions.READY, 3);
      await proveLegacyArchiveReads(context, staged.id);
      const preview = await post(context, `${staged.id}/reconcile`);
      assert.equal(preview.status, 201);
      assert.equal(
        (
          (await preview.json()) as {
            passed: boolean;
          }
        ).passed,
        false,
      );
      const promoteHeaders = {
        ...context.unsafeHeaders,
        'idempotency-key': `promote-${randomUUID()}`,
      };
      const promoted = await post(context, `${staged.id}/promote-ready`, promoteHeaders);
      assert.equal(promoted.status, 201);
      assert.equal(
        (
          (await promoted.json()) as {
            promotedRows: number;
          }
        ).promotedRows,
        3,
      );
      const promoteReplay = await post(context, `${staged.id}/promote-ready`, promoteHeaders);
      assert.equal(promoteReplay.status, 201);
      assert.equal(
        (
          (await promoteReplay.json()) as {
            promotedRows: number;
          }
        ).promotedRows,
        3,
      );
      const reconciled = await post(context, `${staged.id}/reconcile`);
      assert.equal(reconciled.status, 201);
      assert.equal(
        (
          (await reconciled.json()) as {
            passed: boolean;
          }
        ).passed,
        true,
      );
      const finalizeHeaders = {
        ...context.unsafeHeaders,
        'idempotency-key': `finalize-${randomUUID()}`,
      };
      const finalized = await post(context, `${staged.id}/finalize`, finalizeHeaders);
      assert.equal(finalized.status, 201);
      assert.equal(
        (
          (await finalized.json()) as {
            status: string;
          }
        ).status,
        'FINALIZED',
      );
      const finalizeReplay = await post(context, `${staged.id}/finalize`, finalizeHeaders);
      assert.equal(finalizeReplay.status, 201);
      assert.equal(
        (
          (await finalizeReplay.json()) as {
            status: string;
          }
        ).status,
        'FINALIZED',
      );
      assert.equal(
        await context.prisma.payment.count({
          where: { organizationId: context.organizationId, status: 'POSTED' },
        }),
        2,
      );
      assert.equal(
        await context.prisma.attendanceRecord.count({
          where: {
            organizationId: context.organizationId,
            currentStatus: 'PRESENT',
          },
        }),
        1,
      );
      const foreign = await seedForeignBatch(context.prisma);
      const hidden = await fetch(`${context.baseUrl}/api/v1/imports/batches/${foreign}`, {
        headers: context.safeHeaders,
      });
      assert.equal(hidden.status, 404);
    },
  );
}
async function proveLegacyArchiveReads(context: HttpTestContext, batchId: string): Promise<void> {
  const list = await fetch(`${context.baseUrl}/api/v1/legacy-archive?batchId=${batchId}&limit=10`, {
    headers: context.safeHeaders,
  });
  assert.equal(list.status, 200, await list.clone().text());
  const body = (await list.json()) as {
    items: Array<{
      id: string;
      batchId: string;
    }>;
  };
  const record = body.items.find((item) => item.batchId === batchId);
  assert.ok(record);
  const detail = await fetch(`${context.baseUrl}/api/v1/legacy-archive/${record.id}`, {
    headers: context.safeHeaders,
  });
  assert.equal(detail.status, 200, await detail.clone().text());
  assert.equal(
    (
      (await detail.json()) as {
        id: string;
      }
    ).id,
    record.id,
  );
}
function post(
  context: Pick<HttpTestContext, 'baseUrl' | 'unsafeHeaders'>,
  path: string,
  headers = context.unsafeHeaders,
) {
  return fetch(`${context.baseUrl}/api/v1/imports/batches/${path}`, {
    method: 'POST',
    headers,
  });
}
async function seedForeignBatch(database: Prisma.TransactionClient) {
  const organization = await database.organization.create({
    data: {
      code: `FOREIGN-${randomUUID().slice(0, 8)}`.toUpperCase(),
      name: 'Foreign',
    },
  });
  const person = await database.person.create({
    data: {
      organizationId: organization.id,
      publicId: `FOREIGN-${randomUUID().slice(0, 16)}`,
      name: 'Foreign Actor',
    },
  });
  const user = await database.user.create({
    data: {
      organizationId: organization.id,
      personId: person.id,
      status: 'ACTIVE',
    },
  });
  const batch = await database.importBatch.create({
    data: {
      organizationId: organization.id,
      sourceSha256: 'f'.repeat(64),
      receivedBy: user.id,
    },
  });
  return batch.id;
}
