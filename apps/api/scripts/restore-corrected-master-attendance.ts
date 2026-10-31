import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { ImportArchiveWriter } from '../src/imports/import-archive-writer';
import { ImportLifecycleEventsService } from '../src/imports/import-lifecycle-events.service';
import { meaningfulAttendance, personMatches } from '../src/imports/import-row-matching';
import { ImportValidationService } from '../src/imports/import-validation.service';
import { asObject, parseAttendance, type MasterValue } from '../src/imports/import-values';
import type { XlsxScalar } from '../src/imports/xlsx-reader';
import { PrismaService } from '../src/platform/database/prisma.service';
import { OutboxService } from '../src/platform/outbox/outbox.service';

config({ path: resolve(__dirname, '../../../.env') });

const [batchId, reportPath] = process.argv.slice(2);
if (!batchId || !reportPath) {
  throw new Error('Usage: ts-node restore-corrected-master-attendance.ts <batch-id> <report.json>');
}

const prisma = new PrismaService();
const events = new ImportLifecycleEventsService(new OutboxService());
const validation = new ImportValidationService(prisma, new ImportArchiveWriter(), events);

async function accessContext(): Promise<AccessContext> {
  const organization = await prisma.organization.findUniqueOrThrow({ where: { code: 'PLG' } });
  const ownerIdentifier = await prisma.userLoginIdentifier.findFirstOrThrow({
    where: {
      organizationId: organization.id,
      type: 'EMAIL',
      normalizedValue: 'owner@plg.local',
      revokedAt: null,
    },
  });
  const branchIds = new Set(
    (
      await prisma.branch.findMany({
        where: { organizationId: organization.id, isActive: true },
        select: { id: true },
      })
    ).map(({ id }) => id),
  );
  return {
    organizationId: organization.id,
    actorUserId: ownerIdentifier.userId,
    branchIds,
    grants: new Map(),
    assignedResourceIds: new Set(),
    mfaVerifiedAt: new Date().toISOString(),
  } as AccessContext;
}

async function main() {
  const access = await accessContext();
  await prisma.importBatch.findFirstOrThrow({
    where: { id: batchId, organizationId: access.organizationId },
  });
  const sourceIds = (
    await prisma.importSourceFile.findMany({
      where: { organizationId: access.organizationId, batchId },
      select: { id: true },
    })
  ).map(({ id }) => id);
  const correctedMasterIssueRows = new Set(
    (
      await prisma.importIssue.findMany({
        where: {
          organizationId: access.organizationId,
          batchId,
          code: 'DUPLICATE_LEGACY_ENROLLMENT',
          status: 'RESOLVED',
          importRowId: { not: null },
        },
        select: { importRowId: true },
      })
    ).flatMap(({ importRowId }) => (importRowId ? [importRowId] : [])),
  );
  const correctedMasters = (
    await prisma.importRow.findMany({
      where: {
        organizationId: access.organizationId,
        sourceFileId: { in: sourceIds },
        id: { in: [...correctedMasterIssueRows] },
        sheetName: 'Master Sheet',
        disposition: 'IMPORTED',
      },
      select: { id: true, rowNumber: true, normalizedValues: true },
    })
  ).map((row) => ({ row, value: asObject<MasterValue>(row.normalizedValues) }));
  const archivedAttendanceIssueRows = new Set(
    (
      await prisma.importIssue.findMany({
        where: {
          organizationId: access.organizationId,
          batchId,
          code: 'MASTER_STUDENT_NOT_FOUND',
          status: 'RESOLVED',
          importRowId: { not: null },
        },
        select: { importRowId: true },
      })
    ).flatMap(({ importRowId }) => (importRowId ? [importRowId] : [])),
  );
  const archivedRows = await prisma.importRow.findMany({
    where: {
      organizationId: access.organizationId,
      sourceFileId: { in: sourceIds },
      id: { in: [...archivedAttendanceIssueRows] },
      sheetName: 'Attendance & Cert.',
      disposition: 'ARCHIVED',
    },
    select: { id: true, rowNumber: true, rawValues: true },
  });
  const candidates = archivedRows
    .map((row) => ({
      row,
      value: parseAttendance(asObject<Record<string, XlsxScalar>>(row.rawValues)),
    }))
    .filter(({ value }) => meaningfulAttendance(value))
    .map(({ row, value }) => ({
      row,
      value,
      matches: correctedMasters.filter(({ value: master }) => personMatches(value, master)),
    }))
    .filter(({ matches }) => matches.length === 1);

  if (candidates.length) {
    await prisma.importRow.updateMany({
      where: {
        organizationId: access.organizationId,
        id: { in: candidates.map(({ row }) => row.id) },
      },
      data: {
        disposition: 'STAGED',
        normalizedValues: Prisma.JsonNull,
        targetType: null,
        targetId: null,
      },
    });
  }
  const validationSummary = await validation.validate(access, batchId);
  const outcomes = await prisma.importRow.findMany({
    where: {
      organizationId: access.organizationId,
      id: { in: candidates.map(({ row }) => row.id) },
    },
    orderBy: { rowNumber: 'asc' },
    select: { id: true, rowNumber: true, disposition: true },
  });
  const report = {
    generatedAt: new Date().toISOString(),
    batchId,
    correctedMasterRows: correctedMasters.map(({ row }) => row.rowNumber).sort((a, b) => a - b),
    restoredAttendanceRows: candidates.map(({ row }) => row.rowNumber).sort((a, b) => a - b),
    outcomes,
    validationSummary,
  };
  await writeFile(resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
