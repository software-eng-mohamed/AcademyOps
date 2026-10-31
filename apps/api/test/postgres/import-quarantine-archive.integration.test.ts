import { randomUUID } from 'node:crypto';
import type { AccessContext } from '@academyops/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ImportAttendanceWriter } from '../../src/imports/import-attendance-writer';
import { ImportArchiveWriter } from '../../src/imports/import-archive-writer';
import { ImportCatalogBuilder } from '../../src/imports/import-catalog-builder';
import { ImportCatalogWriter } from '../../src/imports/import-catalog-writer';
import { ImportFinalizerService } from '../../src/imports/import-finalizer.service';
import { ImportFinanceWriter } from '../../src/imports/import-finance-writer';
import { ImportLifecycleEventsService } from '../../src/imports/import-lifecycle-events.service';
import { ImportQuarantineService } from '../../src/imports/import-quarantine.service';
import { ImportQueryService } from '../../src/imports/import-query.service';
import { ImportStagingService } from '../../src/imports/import-staging.service';
import { ImportStudentWriter } from '../../src/imports/import-student-writer';
import { ImportValidationService } from '../../src/imports/import-validation.service';
import { PrismaService } from '../../src/platform/database/prisma.service';
import { IdempotencyService } from '../../src/platform/idempotency/idempotency.service';
import { OutboxService } from '../../src/platform/outbox/outbox.service';
import { createImportWorkbook } from './import-test-workbook';
const databaseDescribe = process.env.DATABASE_URL ? describe : describe.skip;
const prisma = new PrismaService();
const events = new ImportLifecycleEventsService(new OutboxService());
const archiveWriter = new ImportArchiveWriter();
const catalog = new ImportCatalogWriter(new ImportCatalogBuilder());
const queries = new ImportQueryService(prisma, events, archiveWriter);
const staging = new ImportStagingService(prisma, events);
const validation = new ImportValidationService(prisma, archiveWriter, events);
const quarantine = new ImportQuarantineService(
  prisma,
  new IdempotencyService(),
  archiveWriter,
  events,
);
const finalizer = new ImportFinalizerService(
  prisma,
  new IdempotencyService(),
  catalog,
  new ImportStudentWriter(catalog, new ImportFinanceWriter()),
  new ImportAttendanceWriter(catalog),
  queries,
  events,
);
databaseDescribe('quarantined import row exclusion', () => {
  let access: AccessContext;
  beforeAll(async () => {
    process.env.LEGACY_ARCHIVE_KEY = 'test-legacy-archive-key-with-at-least-32-chars';
    const organization = await prisma.organization.create({
      data: { code: `ARCH-${randomUUID()}`, name: 'Archive' },
    });
    await prisma.branch.create({
      data: {
        organizationId: organization.id,
        code: 'MAIN',
        name: 'Main',
      },
    });
    const person = await prisma.person.create({
      data: {
        organizationId: organization.id,
        publicId: `ACT-${randomUUID().slice(0, 20)}`,
        name: 'Archive Owner',
      },
    });
    const actor = await prisma.user.create({
      data: { organizationId: organization.id, personId: person.id, status: 'ACTIVE' },
    });
    access = {
      organizationId: organization.id,
      actorUserId: actor.id,
      branchIds: new Set(),
      grants: new Map(),
    } as unknown as AccessContext;
  });
  afterAll(async () => prisma.$disconnect());
  it('encrypts and scrubs quarantined rows before finalizing only clean data', async () => {
    const staged = await staging.stage(
      access,
      'archive-quarantine.xlsx',
      createImportWorkbook(`A${randomUUID().replaceAll('-', '').slice(0, 8)}`, {
        invalidMaster: true,
      }),
    );
    await validation.validate(access, staged.id);
    const key = `archive-${randomUUID()}`;
    const note = 'Owner approved excluding unresolved legacy rows';
    const archived = await quarantine.archive(access, staged.id, key, note);
    expect(archived).toMatchObject({
      status: 'VALIDATED',
      archivedRows: 1,
      remainingOpenIssues: 0,
    });
    expect(await quarantine.archive(access, staged.id, key, note)).toEqual(archived);
    const sourceIds = (
      await prisma.importSourceFile.findMany({
        where: { organizationId: access.organizationId, batchId: staged.id },
        select: { id: true },
      })
    ).map(({ id }) => id);
    const row = await prisma.importRow.findFirstOrThrow({
      where: {
        organizationId: access.organizationId,
        sourceFileId: { in: sourceIds },
        disposition: 'ARCHIVED',
        sheetName: 'Master Sheet',
        rowNumber: 5,
      },
    });
    expect(row.rawValues).toEqual({ archived: true });
    expect(row.normalizedValues).toBeNull();
    expect(
      await prisma.legacyArchiveRecord.count({
        where: { organizationId: access.organizationId, batchId: staged.id },
      }),
    ).toBeGreaterThan(0);
    expect(
      await prisma.auditEvent.count({
        where: {
          organizationId: access.organizationId,
          entityId: staged.id,
          action: 'IMPORT_QUARANTINED_ROWS_ARCHIVED',
        },
      }),
    ).toBe(1);
    const outbox = await prisma.outboxEvent.findFirstOrThrow({
      where: {
        organizationId: access.organizationId,
        aggregateId: staged.id,
        type: 'imports.batch.quarantined_rows_archived',
      },
    });
    expect(outbox.payload).toMatchObject({
      batchId: staged.id,
      status: 'VALIDATED',
      counts: { archivedRows: 1, remainingOpenIssues: 0 },
    });
    expect(JSON.stringify(outbox.payload)).not.toMatch(
      /note|rawValues|normalizedValues|phone|email/i,
    );
    await finalizer.promote(access, staged.id, `promote-${randomUUID()}`);
    expect((await queries.reconcile(access, staged.id)).passed).toBe(true);
    await expect(
      finalizer.finalize(access, staged.id, `final-${randomUUID()}`),
    ).resolves.toMatchObject({ status: 'FINALIZED' });
  }, 30000);
});
