import { createManualBatch, invalidMaster } from './import-invalid-fixture';
import { randomUUID } from 'node:crypto';
import type { AccessContext } from '@academyops/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/platform/database/prisma.service';
import { IdempotencyService } from '../../src/platform/idempotency/idempotency.service';
import { ImportAttendanceWriter } from '../../src/imports/import-attendance-writer';
import { ImportArchiveWriter } from '../../src/imports/import-archive-writer';
import { ImportCatalogBuilder } from '../../src/imports/import-catalog-builder';
import { ImportCatalogWriter } from '../../src/imports/import-catalog-writer';
import { ImportFinalizerService } from '../../src/imports/import-finalizer.service';
import { ImportFinanceWriter } from '../../src/imports/import-finance-writer';
import { ImportLifecycleEventsService } from '../../src/imports/import-lifecycle-events.service';
import { ImportQueryService } from '../../src/imports/import-query.service';
import { ImportStagingService } from '../../src/imports/import-staging.service';
import { ImportStudentWriter } from '../../src/imports/import-student-writer';
import { ImportValidationService } from '../../src/imports/import-validation.service';
import { OutboxService } from '../../src/platform/outbox/outbox.service';
import { createImportWorkbook } from './import-test-workbook';
const databaseDescribe = process.env.DATABASE_URL ? describe : describe.skip;
const prisma = new PrismaService();
const builder = new ImportCatalogBuilder();
const catalog = new ImportCatalogWriter(builder);
const finance = new ImportFinanceWriter();
const students = new ImportStudentWriter(catalog, finance);
const attendance = new ImportAttendanceWriter(catalog);
const events = new ImportLifecycleEventsService(new OutboxService());
const queries = new ImportQueryService(prisma, events, new ImportArchiveWriter());
const staging = new ImportStagingService(prisma, events);
const validation = new ImportValidationService(prisma, new ImportArchiveWriter(), events);
const finalizer = new ImportFinalizerService(
  prisma,
  new IdempotencyService(),
  catalog,
  students,
  attendance,
  queries,
  events,
);
databaseDescribe('production legacy import finalization', () => {
  let access: AccessContext;
  beforeAll(async () => {
    process.env.LEGACY_ARCHIVE_KEY = 'test-legacy-archive-key-with-at-least-32-chars';
    const organization = await prisma.organization.create({
      data: { code: `IMPORT-${randomUUID()}`, name: 'Import Test' },
    });
    const branch = await prisma.branch.create({
      data: { organizationId: organization.id, code: 'MAIN', name: 'Main' },
    });
    const actorPerson = await prisma.person.create({
      data: {
        organizationId: organization.id,
        publicId: `ACT-${randomUUID().slice(0, 20)}`,
        name: 'Importer',
      },
    });
    const actor = await prisma.user.create({
      data: { organizationId: organization.id, personId: actorPerson.id, status: 'ACTIVE' },
    });
    access = {
      organizationId: organization.id,
      actorUserId: actor.id,
      branchIds: new Set([branch.id]),
      grants: new Map(),
    } as unknown as AccessContext;
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  it('stages, validates, finalizes, reconciles, and safely replays all three visible sheets', async () => {
    const legacyCode = `T${randomUUID().replaceAll('-', '').slice(0, 8)}`;
    const workbook = createImportWorkbook(legacyCode);
    const staged = await staging.stage(access, 'academy.xlsx', workbook);
    expect(staged.duplicate).toBe(false);
    const validated = await validation.validate(access, staged.id);
    expect(validated.openIssues).toBe(0);
    expect(validated.dispositions.READY).toBe(3);
    const previewReconciliation = await queries.reconcile(access, staged.id);
    expect(previewReconciliation.passed).toBe(false);
    expect(await prisma.importBatch.findUniqueOrThrow({ where: { id: staged.id } })).toMatchObject({
      status: 'VALIDATED',
    });
    const promoted = await finalizer.promote(access, staged.id, `promote-${randomUUID()}`);
    expect(promoted).toMatchObject({ status: 'VALIDATED', promotedRows: 3 });
    expect((await queries.reconcile(access, staged.id)).passed).toBe(true);
    const masterSource = await prisma.importSourceFile.findFirstOrThrow({
      where: { organizationId: access.organizationId, batchId: staged.id },
    });
    const masterRow = await prisma.importRow.findFirstOrThrow({
      where: {
        organizationId: access.organizationId,
        sourceFileId: masterSource.id,
        sheetName: 'Master Sheet',
        disposition: 'IMPORTED',
      },
    });
    const importedPaymentReference = await prisma.legacyReference.findFirstOrThrow({
      where: {
        organizationId: access.organizationId,
        importRowId: masterRow.id,
        entityType: 'PAYMENT',
        sourceField: 'PAYMENT',
      },
    });
    const importedPayment = await prisma.payment.findUniqueOrThrow({
      where: { id: importedPaymentReference.entityId },
    });
    await prisma.payment.update({
      where: { id: importedPayment.id },
      data: { amount: { increment: 0.01 } },
    });
    const oneCentMismatch = await queries.reconcile(access, staged.id);
    expect(oneCentMismatch.passed).toBe(false);
    expect(oneCentMismatch.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metric: 'finance.payment_slots_exact', passed: false }),
        expect.objectContaining({ metric: 'finance.payment_slots_minor', difference: 1 }),
      ]),
    );
    await expect(
      finalizer.finalize(access, staged.id, `finalize-mismatch-${randomUUID()}`),
    ).rejects.toMatchObject({ response: { code: 'IMPORT_FINALIZATION_BLOCKED' } });
    await prisma.payment.update({
      where: { id: importedPayment.id },
      data: { amount: importedPayment.amount },
    });
    expect((await queries.reconcile(access, staged.id)).passed).toBe(true);
    const result = await finalizer.finalize(access, staged.id, `finalize-${randomUUID()}`);
    expect(result.status).toBe('FINALIZED');
    const detail = await queries.getBatch(access, staged.id);
    expect(detail.status).toBe('FINALIZED');
    expect(detail.reconciliation.every((metric) => metric.passed)).toBe(true);
    const enrollmentReference = await prisma.legacyReference.findFirstOrThrow({
      where: {
        organizationId: access.organizationId,
        entityType: 'ENROLLMENT',
        sourceField: 'MASTER_ENROLLMENT_KEY',
        rawValue: `${legacyCode.toUpperCase()}|TST 1`,
      },
    });
    const enrollment = await prisma.enrollment.findUniqueOrThrow({
      where: { id: enrollmentReference.entityId },
    });
    expect(
      await prisma.payment.count({
        where: {
          organizationId: access.organizationId,
          enrollmentId: enrollment.id,
          status: 'POSTED',
        },
      }),
    ).toBe(2);
    const references = await prisma.payment.findMany({
      where: { organizationId: access.organizationId, enrollmentId: enrollment.id },
      select: { externalReference: true },
    });
    expect(new Set(references.map((payment) => payment.externalReference)).size).toBe(2);
    expect(
      await prisma.attendanceRecord.count({
        where: {
          organizationId: access.organizationId,
          enrollmentId: enrollment.id,
          currentStatus: 'PRESENT',
        },
      }),
    ).toBe(1);
    expect(
      await prisma.session.count({ where: { organizationId: access.organizationId } }),
    ).toBeGreaterThan(0);
    expect(
      await prisma.legacyReference.count({
        where: {
          organizationId: access.organizationId,
          entityType: 'CERTIFICATE_HISTORY',
          sourceField: 'CERTIFICATE_STATUS',
          rawValue: 'Done',
        },
      }),
    ).toBe(1);
    expect(
      await prisma.certificate.count({
        where: { organizationId: access.organizationId, enrollmentId: enrollment.id },
      }),
    ).toBe(0);
    const archive = await prisma.legacyArchiveRecord.findFirstOrThrow({
      where: { organizationId: access.organizationId, batchId: staged.id },
    });
    expect(archive.encryptedData).not.toContain('duplicate archived row');
    expect(
      await prisma.importRow.findFirstOrThrow({
        where: {
          organizationId: access.organizationId,
          sourceFileId: archive.sourceFileId,
          sheetName: archive.sheetName,
          rowNumber: archive.rowNumber,
        },
      }),
    ).toMatchObject({ rawValues: { archived: true } });
    const before = await thisCounts(enrollment.id);
    const duplicateStage = await staging.stage(access, 'academy-renamed.xlsx', workbook);
    expect(duplicateStage).toMatchObject({ id: staged.id, duplicate: true });
    expect((await finalizer.finalize(access, staged.id, `other-${randomUUID()}`)).status).toBe(
      'FINALIZED',
    );
    expect(await thisCounts(enrollment.id)).toEqual(before);
    const lifecycle = await prisma.outboxEvent.findMany({
      where: { organizationId: access.organizationId, aggregateId: staged.id },
      orderBy: { occurredAt: 'asc' },
      select: { type: true, payload: true },
    });
    expect(lifecycle.map(({ type }) => type)).toEqual([
      'imports.batch.staged',
      'imports.batch.validated',
      'imports.batch.reconciled',
      'imports.batch.ready_rows_promoted',
      'imports.batch.reconciled',
      'imports.batch.finalized',
    ]);
    expect(JSON.stringify(lifecycle)).not.toMatch(/academy|sha256|metrics|email|phone|rawValues/i);
  }, 30000);
  it('lists quarantined rows and rejects corrections that introduce validation failures', async () => {
    const invalid = invalidMaster(`BAD${randomUUID().replaceAll('-', '').slice(0, 8)}`);
    const batch = await createManualBatch(prisma, access, invalid, 'QUARANTINED');
    const issue = await prisma.importIssue.create({
      data: {
        organizationId: access.organizationId,
        batchId: batch.id,
        importRowId: batch.rowId,
        severity: 'CRITICAL',
        code: 'MANUAL_REVIEW',
        message: 'MANUAL_REVIEW',
      },
    });
    const listed = await queries.listIssues(access, batch.id, { limit: 25, status: 'OPEN' });
    expect(listed.items.map((item) => item.id)).toContain(issue.id);
    const row = await prisma.importRow.findUniqueOrThrow({ where: { id: batch.rowId } });
    await expect(
      queries.resolveIssue(access, batch.id, issue.id, {
        schemaVersion: 'plg-import-correction/v1',
        decision: 'CORRECT',
        expectedRowHash: row.rowHash,
        expectedIssueCode: issue.code,
        expectedIssueVersion: 1,
        correction: { kind: 'ROW_VALUES', values: invalid },
        note: 'Reviewed invalid fixture for rollback test',
      }),
    ).rejects.toThrow();
    await expect(
      finalizer.promote(access, batch.id, `rollback-${randomUUID()}`),
    ).resolves.toMatchObject({
      partial: true,
      promotedRows: 0,
      quarantinedRows: 1,
      openIssues: 1,
    });
    expect(
      await prisma.person.count({
        where: { organizationId: access.organizationId, name: 'Rollback Student' },
      }),
    ).toBe(0);
    expect(await prisma.importBatch.findUniqueOrThrow({ where: { id: batch.id } })).toMatchObject({
      status: 'VALIDATED',
    });
    expect(await prisma.importRow.findUniqueOrThrow({ where: { id: batch.rowId } })).toMatchObject({
      disposition: 'QUARANTINED',
      targetId: null,
    });
  }, 30000);
  async function thisCounts(enrollmentId: string) {
    return {
      enrollments: await prisma.enrollment.count({
        where: { organizationId: access.organizationId, id: enrollmentId },
      }),
      payments: await prisma.payment.count({
        where: { organizationId: access.organizationId, enrollmentId },
      }),
      attendance: await prisma.attendanceRecord.count({
        where: { organizationId: access.organizationId, enrollmentId },
      }),
    };
  }
});
