import { createHash, randomUUID } from 'node:crypto';
import type { AccessContext } from '@academyops/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ImportQueryService } from '../../src/imports/import-query.service';
import { ImportArchiveWriter } from '../../src/imports/import-archive-writer';
import { ImportLifecycleEventsService } from '../../src/imports/import-lifecycle-events.service';
import { PrismaService } from '../../src/platform/database/prisma.service';
import { OutboxService } from '../../src/platform/outbox/outbox.service';
const databaseDescribe = process.env.DATABASE_URL ? describe : describe.skip;
const prisma = new PrismaService();
const queries = new ImportQueryService(
  prisma,
  new ImportLifecycleEventsService(new OutboxService()),
  new ImportArchiveWriter(),
);
type Fixture = Awaited<ReturnType<typeof createFixture>>;
databaseDescribe('import query tenant and PII access', () => {
  let own: Fixture;
  let other: Fixture;
  beforeAll(async () => {
    own = await createFixture('OWN');
    other = await createFixture('OTHER');
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  it('serializes batch detail, filters issues, and gates row snapshots to org finalizers', async () => {
    const detail = await queries.getBatch(own.preview, own.batchId);
    expect(detail.sources[0]?.sizeBytes).toBe('9007199254740993');
    expect(() => JSON.stringify(detail)).not.toThrow();
    const preview = await queries.listIssues(own.preview, own.batchId, {
      limit: 25,
      status: 'OPEN',
      severity: 'CRITICAL',
      code: 'OWN_REVIEW',
    });
    expect(preview.items).toHaveLength(1);
    expect(preview.items[0]?.row).toBeNull();
    const finalizer = await queries.listIssues(own.finalizer, own.batchId, {
      limit: 25,
      status: 'OPEN',
      severity: 'CRITICAL',
      code: 'OWN_REVIEW',
    });
    expect(finalizer.items).toHaveLength(1);
    expect(finalizer.items[0]?.row).toMatchObject({
      id: own.rowId,
      sheetName: 'Master Sheet',
      rowNumber: 2,
      disposition: 'QUARANTINED',
      rawValues: { email: 'private@example.test' },
      normalizedValues: { email: 'private@example.test' },
    });
    const filteredOut = await queries.listIssues(own.finalizer, own.batchId, {
      limit: 25,
      severity: 'HIGH',
      code: 'OWN_REVIEW',
    });
    expect(filteredOut.items).toHaveLength(0);
    await expect(
      queries.listIssues(own.finalizer, other.batchId, { limit: 25 }),
    ).rejects.toMatchObject({
      response: { code: 'IMPORT_BATCH_NOT_FOUND' },
    });
  });
});
async function createFixture(label: string) {
  const organization = await prisma.organization.create({
    data: { code: `IMPQ-${label}-${randomUUID().slice(0, 8)}`, name: label },
  });
  const person = await prisma.person.create({
    data: {
      organizationId: organization.id,
      publicId: `ACT-${randomUUID().slice(0, 20)}`,
      name: `${label} actor`,
    },
  });
  const user = await prisma.user.create({
    data: { organizationId: organization.id, personId: person.id, status: 'ACTIVE' },
  });
  const batch = await prisma.importBatch.create({
    data: {
      organizationId: organization.id,
      sourceSha256: digest(`${label}-batch-${randomUUID()}`),
      receivedBy: user.id,
      status: 'VALIDATED',
    },
  });
  const source = await prisma.importSourceFile.create({
    data: {
      organizationId: organization.id,
      batchId: batch.id,
      originalName: `${label}.xlsx`,
      sha256: digest(`${label}-source-${randomUUID()}`),
      sizeBytes: 9007199254740993n,
    },
  });
  const row = await prisma.importRow.create({
    data: {
      organizationId: organization.id,
      sourceFileId: source.id,
      sheetName: 'Master Sheet',
      rowNumber: 2,
      rowHash: digest(`${label}-row-${randomUUID()}`),
      rawValues: { email: 'private@example.test' },
      normalizedValues: { email: 'private@example.test' },
      disposition: 'QUARANTINED',
    },
  });
  await prisma.importIssue.createMany({
    data: [
      {
        organizationId: organization.id,
        batchId: batch.id,
        importRowId: row.id,
        severity: 'CRITICAL',
        code: `${label}_REVIEW`,
        message: `${label}_REVIEW`,
      },
      {
        organizationId: organization.id,
        batchId: batch.id,
        importRowId: row.id,
        severity: 'HIGH',
        code: `${label}_OTHER`,
        message: `${label}_OTHER`,
      },
    ],
  });
  return {
    batchId: batch.id,
    rowId: row.id,
    preview: access(organization.id, user.id, 'imports.preview'),
    finalizer: access(organization.id, user.id, 'imports.finalize'),
  };
}
function access(
  organizationId: string,
  actorUserId: string,
  permission: 'imports.preview' | 'imports.finalize',
): AccessContext {
  return {
    organizationId,
    actorUserId,
    grants: new Map([[permission, new Set(['O'])]]),
    branchIds: new Set(),
    assignedResourceIds: new Set(),
  };
}
function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
