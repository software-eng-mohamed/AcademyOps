import { createHash, randomUUID } from 'node:crypto';
import type { AccessContext } from '@academyops/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ImportAttendanceWriter } from '../../src/imports/import-attendance-writer';
import { ImportCatalogBuilder } from '../../src/imports/import-catalog-builder';
import { ImportCatalogWriter } from '../../src/imports/import-catalog-writer';
import { ImportFinanceWriter } from '../../src/imports/import-finance-writer';
import { ImportStudentWriter } from '../../src/imports/import-student-writer';
import {
  jsonObject,
  type AttendanceRowValue,
  type MasterValue,
} from '../../src/imports/import-values';
import { PrismaService } from '../../src/platform/database/prisma.service';

const databaseDescribe = process.env.DATABASE_URL ? describe : describe.skip;
const prisma = new PrismaService();
const catalog = new ImportCatalogWriter(new ImportCatalogBuilder());
const students = new ImportStudentWriter(catalog, new ImportFinanceWriter());
const attendance = new ImportAttendanceWriter(catalog);

databaseDescribe('import identity decisions and attendance provenance', () => {
  let access: AccessContext;
  let sourceFileId: string;
  let existingPersonId: string;
  let nextRowNumber = 4;

  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { code: `IMPORT-ID-${randomUUID()}`, name: 'Import identity test' },
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
    const existing = await prisma.person.create({
      data: {
        organizationId: organization.id,
        publicId: `KNOWN-${randomUUID().slice(0, 20)}`,
        name: 'Known person',
      },
    });
    existingPersonId = existing.id;
    await prisma.personContact.createMany({
      data: [
        {
          organizationId: organization.id,
          personId: existing.id,
          type: 'PHONE',
          rawValue: '+201012345678',
          normalizedValue: '+201012345678',
        },
        {
          organizationId: organization.id,
          personId: existing.id,
          type: 'EMAIL',
          rawValue: 'shared@example.test',
          normalizedValue: 'shared@example.test',
        },
      ],
    });
    const digest = createHash('sha256').update(randomUUID()).digest('hex');
    const batch = await prisma.importBatch.create({
      data: {
        organizationId: organization.id,
        status: 'VALIDATED',
        sourceSha256: digest,
        receivedBy: actor.id,
      },
    });
    const source = await prisma.importSourceFile.create({
      data: {
        organizationId: organization.id,
        batchId: batch.id,
        originalName: 'identity-attendance.xlsx',
        sha256: digest,
        sizeBytes: 1,
      },
    });
    sourceFileId = source.id;
    access = {
      organizationId: organization.id,
      actorUserId: actor.id,
      branchIds: new Set([branch.id]),
      grants: new Map(),
    } as unknown as AccessContext;
  });

  afterAll(async () => prisma.$disconnect());

  it('creates a distinct row-scoped person for overlapping contacts and retains match evidence', async () => {
    const { row, value } = await masterRow('DISTINCT');
    await prisma.$transaction((db) => students.write(db, access, [row]));
    const imported = await importedEnrollment(row.id);
    expect(imported.studentPersonId).not.toBe(existingPersonId);
    const evidence = await prisma.personMatchCandidate.findFirstOrThrow({
      where: {
        organizationId: access.organizationId,
        importRowId: row.id,
        candidatePersonId: existingPersonId,
      },
    });
    expect(Number(evidence.score)).toBe(1);
    expect(evidence.reasons).toEqual({
      matchedContactTypes: ['EMAIL', 'PHONE'],
      rule: 'Contact overlap is evidence only and never merges an imported row automatically',
    });
    expect(
      await prisma.person.count({
        where: { organizationId: access.organizationId, name: value.name },
      }),
    ).toBe(1);
  });

  it('reuses only the person selected by an explicit reviewed row mapping', async () => {
    const { row } = await masterRow('MAPPED');
    await prisma.personMatchCandidate.create({
      data: {
        organizationId: access.organizationId,
        importRowId: row.id,
        candidatePersonId: existingPersonId,
        score: 1,
        reasons: {},
        decision: 'MATCHED',
        decidedBy: access.actorUserId,
        decidedAt: new Date(),
      },
    });
    await prisma.legacyReference.create({
      data: {
        organizationId: access.organizationId,
        importRowId: row.id,
        entityType: 'PERSON',
        entityId: existingPersonId,
        sourceField: 'REVIEWED_PERSON_MAPPING',
        rawValue: 'MATCH_EXISTING',
      },
    });
    await prisma.$transaction((db) => students.write(db, access, [row]));
    expect((await importedEnrollment(row.id)).studentPersonId).toBe(existingPersonId);
  });

  it('writes sparse attendance to the original session ordinals with exact cell provenance', async () => {
    const { row: master } = await masterRow('ATTENDANCE');
    await prisma.$transaction((db) => students.write(db, access, [master]));
    const value: AttendanceRowValue = {
      name: 'Attendance person',
      phone: null,
      email: null,
      cohortCode: 'COHORT-ATTENDANCE',
      programCode: 'PROGRAM-ATTENDANCE',
      masterLegacyCode: 'ATTENDANCE',
      deliveryMode: 'IN_PERSON',
      attendanceRatio: 1,
      applicableSessionCount: 2,
      certificateStatus: '',
      attendance: [
        {
          ordinal: 17,
          cohortCode: 'COHORT-ATTENDANCE',
          status: 'PRESENT',
          sourceMarkColumn: 'AS',
          sourceCohortColumn: 'AT',
        },
        {
          ordinal: 18,
          cohortCode: 'COHORT-ATTENDANCE',
          status: 'PRESENT',
          sourceMarkColumn: 'AU',
          sourceCohortColumn: 'AV',
        },
      ],
    };
    const row = await importRow('Attendance & Cert.', 9, value);
    await prisma.$transaction((db) => attendance.write(db, access, [row]));
    const enrollment = await importedEnrollment(master.id);
    const records = await prisma.attendanceRecord.findMany({
      where: { organizationId: access.organizationId, enrollmentId: enrollment.id },
      select: { sessionId: true },
    });
    const sessions = await prisma.session.findMany({
      where: {
        organizationId: access.organizationId,
        id: { in: records.map(({ sessionId }) => sessionId) },
      },
      orderBy: { ordinal: 'asc' },
      select: { ordinal: true },
    });
    expect(sessions.map(({ ordinal }) => ordinal)).toEqual([17, 18]);
    const references = await prisma.legacyReference.findMany({
      where: {
        organizationId: access.organizationId,
        importRowId: row.id,
        entityType: 'ATTENDANCE',
        sourceField: 'ATTENDANCE_MARK',
      },
      orderBy: { rawValue: 'asc' },
      select: { rawValue: true },
    });
    const provenance = references.map(({ rawValue }) => JSON.parse(rawValue) as unknown);
    expect(provenance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceOrdinal: 17, markCell: 'AS9', cohortCell: 'AT9' }),
        expect.objectContaining({ sourceOrdinal: 18, markCell: 'AU9', cohortCell: 'AV9' }),
      ]),
    );
  });

  async function masterRow(legacyCode: string) {
    const value: MasterValue = {
      legacyCode,
      state: 'Active',
      name: `${legacyCode} imported person`,
      phone: '+201012345678',
      email: 'shared@example.test',
      kind: 'Individual',
      branch: 'Main',
      deliveryMode: 'IN_PERSON',
      programCode: `PROGRAM-${legacyCode}`,
      cohortCode: `COHORT-${legacyCode}`,
      subtotal: 0,
      discountAmount: 0,
      totalAmount: 0,
      paidAmount: 0,
      payments: [],
    };
    return { row: await importRow('Master Sheet', nextRowNumber++, value), value };
  }

  async function importRow(sheetName: string, rowNumber: number, value: object) {
    const rowHash = createHash('sha256')
      .update(`${sheetName}:${rowNumber}:${randomUUID()}`)
      .digest('hex');
    return prisma.importRow.create({
      data: {
        organizationId: access.organizationId,
        sourceFileId,
        sheetName,
        rowNumber,
        rowHash,
        rawValues: {},
        normalizedValues: jsonObject(value),
        disposition: 'READY',
      },
      select: { id: true, rowHash: true, normalizedValues: true },
    });
  }

  async function importedEnrollment(importRowId: string) {
    const row = await prisma.importRow.findUniqueOrThrow({ where: { id: importRowId } });
    return prisma.enrollment.findUniqueOrThrow({ where: { id: row.targetId! } });
  }
});
