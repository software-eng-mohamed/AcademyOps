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
import { ImportQueryService } from '../../src/imports/import-query.service';
import { ImportStagingService } from '../../src/imports/import-staging.service';
import { ImportStudentWriter } from '../../src/imports/import-student-writer';
import { ImportValidationService } from '../../src/imports/import-validation.service';
import type { MasterValue } from '../../src/imports/import-values';
import { PrismaService } from '../../src/platform/database/prisma.service';
import { IdempotencyService } from '../../src/platform/idempotency/idempotency.service';
import { OutboxService } from '../../src/platform/outbox/outbox.service';
import { createImportWorkbook } from './import-test-workbook';
const databaseDescribe = process.env.DATABASE_URL ? describe : describe.skip;
const prisma = new PrismaService();
const catalog = new ImportCatalogWriter(new ImportCatalogBuilder());
const events = new ImportLifecycleEventsService(new OutboxService());
const queries = new ImportQueryService(prisma, events, new ImportArchiveWriter());
const staging = new ImportStagingService(prisma, events);
const validation = new ImportValidationService(prisma, new ImportArchiveWriter(), events);
const finalizer = new ImportFinalizerService(
  prisma,
  new IdempotencyService(),
  catalog,
  new ImportStudentWriter(catalog, new ImportFinanceWriter()),
  new ImportAttendanceWriter(catalog),
  queries,
  events,
);
databaseDescribe('legacy import review and promotion', () => {
  let access: AccessContext;
  beforeAll(async () => {
    process.env.LEGACY_ARCHIVE_KEY = 'test-legacy-archive-key-with-at-least-32-chars';
    const organization = await prisma.organization.create({
      data: { code: `IMPORT-${randomUUID()}`, name: 'Import Review' },
    });
    const branch = await prisma.branch.create({
      data: { organizationId: organization.id, code: 'MAIN', name: 'Main' },
    });
    const person = await prisma.person.create({
      data: {
        organizationId: organization.id,
        publicId: `ACT-${randomUUID().slice(0, 20)}`,
        name: 'Importer',
      },
    });
    const actor = await prisma.user.create({
      data: { organizationId: organization.id, personId: person.id, status: 'ACTIVE' },
    });
    access = {
      organizationId: organization.id,
      actorUserId: actor.id,
      branchIds: new Set([branch.id]),
      grants: new Map(),
    } as unknown as AccessContext;
  });
  afterAll(async () => prisma.$disconnect());
  it('promotes ready rows, preserves quarantine, and strictly finalizes after resolution', async () => {
    const legacyCode = `P${randomUUID().replaceAll('-', '').slice(0, 8)}`;
    const staged = await staging.stage(
      access,
      'partial.xlsx',
      createImportWorkbook(legacyCode, { invalidMaster: true }),
    );
    expect((await validation.validate(access, staged.id)).dispositions).toMatchObject({
      READY: 3,
      QUARANTINED: 1,
    });
    const key = `partial-${randomUUID()}`;
    const partial = await finalizer.promote(access, staged.id, key);
    expect(partial).toMatchObject({ partial: true, promotedRows: 3, quarantinedRows: 1 });
    expect(await finalizer.promote(access, staged.id, key)).toEqual(partial);
    expect((await validation.validate(access, staged.id)).dispositions).toMatchObject({
      IMPORTED: 3,
      QUARANTINED: 1,
    });
    await expect(
      finalizer.finalize(access, staged.id, `blocked-${randomUUID()}`),
    ).rejects.toThrow();
    const issue = await prisma.importIssue.findFirstOrThrow({
      where: { organizationId: access.organizationId, batchId: staged.id, status: 'OPEN' },
    });
    const issueRow = await prisma.importRow.findUniqueOrThrow({
      where: { id: issue.importRowId! },
    });
    await queries.resolveIssue(access, staged.id, issue.id, {
      schemaVersion: 'plg-import-correction/v1',
      decision: 'CORRECT',
      expectedRowHash: issueRow.rowHash,
      expectedIssueCode: issue.code,
      expectedIssueVersion: 1,
      correction: { kind: 'ROW_VALUES', values: validMaster(`${legacyCode}-BAD`) },
      note: 'Verified against source documents',
    });
    expect(await finalizer.promote(access, staged.id, `resolved-${randomUUID()}`)).toMatchObject({
      promotedRows: 1,
      partial: false,
    });
    expect((await queries.reconcile(access, staged.id)).passed).toBe(true);
    expect(await finalizer.finalize(access, staged.id, `final-${randomUUID()}`)).toMatchObject({
      status: 'FINALIZED',
    });
  }, 30000);
  it('resolves one validated issue without changing sibling issue evidence', async () => {
    const legacyCode = `S${randomUUID().replaceAll('-', '').slice(0, 8)}`;
    const staged = await staging.stage(
      access,
      'single-issue-correction.xlsx',
      createImportWorkbook(legacyCode, { invalidMaster: true }),
    );
    await validation.validate(access, staged.id);
    const target = await prisma.importIssue.findFirstOrThrow({
      where: {
        organizationId: access.organizationId,
        batchId: staged.id,
        code: 'PAYMENT_EXCEEDS_TOTAL',
      },
    });
    const row = await prisma.importRow.findUniqueOrThrow({ where: { id: target.importRowId! } });
    const sibling = await prisma.importIssue.create({
      data: {
        organizationId: access.organizationId,
        batchId: staged.id,
        importRowId: row.id,
        severity: 'HIGH',
        code: 'DATA_STEWARD_NOTE_REQUIRED',
        message: 'DATA_STEWARD_NOTE_REQUIRED',
        details: { ruleVersion: 1, originalEvidence: { source: 'workbook', cell: 'T5' } },
      },
    });
    await queries.resolveIssue(access, staged.id, target.id, {
      schemaVersion: 'plg-import-correction/v1',
      decision: 'CORRECT',
      expectedRowHash: row.rowHash,
      expectedIssueCode: target.code,
      expectedIssueVersion: 1,
      correction: { kind: 'ROW_VALUES', values: validMaster(`${legacyCode}-BAD`) },
      note: 'Accounts verified that no payment was received',
    });
    expect(await prisma.importIssue.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject({
      status: 'RESOLVED',
      details: { ruleVersion: 1, resolution: { decision: 'CORRECT' } },
    });
    expect(await prisma.importIssue.findUniqueOrThrow({ where: { id: sibling.id } })).toMatchObject(
      {
        status: 'OPEN',
        details: { ruleVersion: 1, originalEvidence: { source: 'workbook', cell: 'T5' } },
      },
    );
    expect(await prisma.importRow.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({
      disposition: 'QUARANTINED',
    });
  }, 30000);
  it('quarantines calendar room collisions before domain writes', async () => {
    const staged = await staging.stage(
      access,
      'collision.xlsx',
      createImportWorkbook(`C${randomUUID().replaceAll('-', '').slice(0, 8)}`, {
        roomCollision: true,
      }),
    );
    await validation.validate(access, staged.id);
    expect(
      await prisma.importIssue.count({
        where: {
          organizationId: access.organizationId,
          batchId: staged.id,
          code: 'CALENDAR_ROOM_CONFLICT',
        },
      }),
    ).toBe(2);
  }, 30000);
  it('uses historical session dates and preserves branch and delivery metadata', async () => {
    const code = `H${randomUUID().replaceAll('-', '').slice(0, 8)}`;
    const staged = await staging.stage(
      access,
      'branches.xlsx',
      createImportWorkbook(code, { noPayment: true, secondBranch: true }),
    );
    await validation.validate(access, staged.id);
    await finalizer.promote(access, staged.id, `branches-${randomUUID()}`);
    const baseReference = await prisma.legacyReference.findFirstOrThrow({
      where: {
        organizationId: access.organizationId,
        sourceField: 'MASTER_ENROLLMENT_KEY',
        rawValue: `${code.toUpperCase()}|TST 1`,
      },
    });
    const assignment = await prisma.enrollmentCohortAssignment.findFirstOrThrow({
      where: { organizationId: access.organizationId, enrollmentId: baseReference.entityId },
    });
    expect(assignment.startsAt.toISOString()).toBe('2026-01-02T07:00:00.000Z');
    const secondPerson = await prisma.person.findFirstOrThrow({
      where: { organizationId: access.organizationId, name: 'Second Branch Student' },
    });
    const second = await prisma.enrollment.findFirstOrThrow({
      where: { organizationId: access.organizationId, studentPersonId: secondPerson.id },
    });
    expect(
      await prisma.branch.findUniqueOrThrow({ where: { id: second.homeBranchId } }),
    ).toMatchObject({ code: 'NASR-CITY' });
    expect(
      await prisma.legacyReference.count({
        where: { organizationId: access.organizationId, sourceField: 'ENROLLMENT_DELIVERY_MODE' },
      }),
    ).toBeGreaterThanOrEqual(2);
  }, 30000);
  it('never merges different people sharing a legacy code', async () => {
    const code = `D${randomUUID().replaceAll('-', '').slice(0, 8)}`;
    const staged = await staging.stage(
      access,
      'duplicate-code.xlsx',
      createImportWorkbook(code, { duplicateCodePerson: true }),
    );
    await validation.validate(access, staged.id);
    expect(
      await prisma.importIssue.count({
        where: {
          organizationId: access.organizationId,
          batchId: staged.id,
          code: 'PERSON_IDENTITY_REVIEW_REQUIRED',
        },
      }),
    ).toBe(2);
    const masterRows = await prisma.importRow.findMany({
      where: {
        organizationId: access.organizationId,
        sourceFileId: {
          in: (
            await prisma.importSourceFile.findMany({
              where: { organizationId: access.organizationId, batchId: staged.id },
              select: { id: true },
            })
          ).map((source) => source.id),
        },
        sheetName: 'Master Sheet',
        disposition: 'QUARANTINED',
      },
      orderBy: { rowNumber: 'asc' },
    });
    for (const row of masterRows) {
      const issue = await prisma.importIssue.findFirstOrThrow({
        where: { organizationId: access.organizationId, batchId: staged.id, importRowId: row.id },
      });
      await queries.resolveIssue(access, staged.id, issue.id, {
        schemaVersion: 'plg-import-correction/v1',
        decision: 'CORRECT',
        expectedRowHash: row.rowHash,
        expectedIssueCode: issue.code,
        expectedIssueVersion: 1,
        correction: { kind: 'PERSON_MAPPING', action: 'CREATE_NEW' },
        note: 'Data Steward confirmed these are distinct people',
      });
      expect(await prisma.importRow.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({
        disposition: 'READY',
      });
    }
    await finalizer.promote(access, staged.id, `identity-${randomUUID()}`);
    const promotedRows = await prisma.importRow.findMany({
      where: { id: { in: masterRows.map((row) => row.id) } },
      select: { targetId: true },
    });
    const enrollments = await prisma.enrollment.findMany({
      where: {
        organizationId: access.organizationId,
        id: { in: promotedRows.flatMap((row) => (row.targetId ? [row.targetId] : [])) },
      },
    });
    expect(new Set(enrollments.map((entry) => entry.studentPersonId)).size).toBe(2);
  }, 30000);
});
function validMaster(legacyCode: string): MasterValue {
  return {
    legacyCode,
    state: 'Active',
    name: 'Resolved Student',
    phone: null,
    email: null,
    kind: 'Individual',
    branch: 'Main',
    deliveryMode: 'IN_PERSON',
    programCode: 'TST',
    cohortCode: 'TST 1',
    subtotal: 1000,
    discountAmount: 0,
    totalAmount: 1000,
    paidAmount: 0,
    payments: [],
  };
}
