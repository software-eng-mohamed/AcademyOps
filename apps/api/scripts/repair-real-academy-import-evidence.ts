import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { ImportArchiveWriter } from '../src/imports/import-archive-writer';
import { ImportLifecycleEventsService } from '../src/imports/import-lifecycle-events.service';
import { calculateImportMetrics, saveImportMetrics } from '../src/imports/import-reconciliation';
import { ImportValidationService } from '../src/imports/import-validation.service';
import {
  asObject,
  parseCalendar,
  parseMaster,
  type CalendarValue,
  type MasterValue,
} from '../src/imports/import-values';
import { readXlsxValues, type XlsxScalar } from '../src/imports/xlsx-reader';
import { PrismaService } from '../src/platform/database/prisma.service';
import { OutboxService } from '../src/platform/outbox/outbox.service';

config({ path: resolve(__dirname, '../../../.env') });

const [workbookPath, expectedSha256, reportPath] = process.argv.slice(2);
if (!workbookPath || !expectedSha256 || !reportPath) {
  throw new Error(
    'Usage: ts-node repair-real-academy-import-evidence.ts <workbook.xlsx> <sha256> <report.json>',
  );
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
  const buffer = await readFile(resolve(workbookPath));
  const workbook = readXlsxValues(buffer);
  if (workbook.sha256 !== expectedSha256) {
    throw new Error(
      `Workbook SHA-256 mismatch: expected ${expectedSha256}, received ${workbook.sha256}`,
    );
  }
  const access = await accessContext();
  const source = await prisma.importSourceFile.findFirstOrThrow({
    where: {
      organizationId: access.organizationId,
      sha256: workbook.sha256,
    },
    orderBy: { createdAt: 'desc' },
  });
  const batch = await prisma.importBatch.findFirstOrThrow({
    where: { organizationId: access.organizationId, id: source.batchId },
  });
  const databaseRows = await prisma.importRow.findMany({
    where: { organizationId: access.organizationId, sourceFileId: source.id },
    select: {
      id: true,
      sheetName: true,
      rowNumber: true,
      disposition: true,
      rawValues: true,
      normalizedValues: true,
      targetType: true,
      targetId: true,
    },
  });
  const databaseRowsByLocation = new Map(
    databaseRows.map((row) => [`${row.sheetName}|${row.rowNumber}`, row]),
  );
  const actions = {
    rowsWithCommentsPreserved: 0,
    commentReferencesCreated: 0,
    masterRowsRefreshed: 0,
    calendarRowsRefreshed: 0,
    coordinatorReferencesCreated: 0,
  };

  await prisma.$transaction(
    async (transaction) => {
      for (const sheet of workbook.sheets) {
        for (const sourceRow of sheet.rows) {
          if (!sourceRow.comments?.length) continue;
          const databaseRow = databaseRowsByLocation.get(`${sheet.name}|${sourceRow.rowNumber}`);
          if (!databaseRow) continue;
          const rawValues = asObject<Record<string, unknown>>(databaseRow.rawValues);
          await transaction.importRow.update({
            where: { id: databaseRow.id },
            data: {
              rawValues: {
                ...rawValues,
                __PLG_COMMENTS__: sourceRow.comments,
              } as Prisma.InputJsonObject,
            },
          });
          actions.rowsWithCommentsPreserved += 1;
          if (!databaseRow.targetId || !databaseRow.targetType) continue;
          for (const comment of sourceRow.comments) {
            const sourceField = `${sheet.name === 'Master Sheet' ? 'MASTER' : 'SOURCE'}_COMMENT_${comment.column}`;
            const existing = await transaction.legacyReference.findFirst({
              where: {
                organizationId: access.organizationId,
                importRowId: databaseRow.id,
                entityType: databaseRow.targetType,
                entityId: databaseRow.targetId,
                sourceField,
                rawValue: comment.text,
              },
              select: { id: true },
            });
            if (existing) continue;
            await transaction.legacyReference.create({
              data: {
                organizationId: access.organizationId,
                importRowId: databaseRow.id,
                entityType: databaseRow.targetType,
                entityId: databaseRow.targetId,
                sourceField,
                rawValue: comment.text,
              },
            });
            actions.commentReferencesCreated += 1;
          }
        }
      }

      for (const row of databaseRows.filter(
        (candidate) =>
          candidate.sheetName === 'Master Sheet' && candidate.disposition === 'IMPORTED',
      )) {
        const parsed = parseMaster(asObject<Record<string, XlsxScalar>>(row.rawValues));
        const normalized = asObject<MasterValue>(row.normalizedValues);
        await transaction.importRow.update({
          where: { id: row.id },
          data: {
            normalizedValues: {
              ...normalized,
              ...parsed,
            } as Prisma.InputJsonObject,
          },
        });
        actions.masterRowsRefreshed += 1;
      }

      for (const row of databaseRows.filter(
        (candidate) =>
          candidate.sheetName === 'Annual Calendar - 2026' && candidate.disposition === 'IMPORTED',
      )) {
        const parsed = parseCalendar(
          asObject<Record<string, XlsxScalar>>(row.rawValues),
          row.sheetName,
        );
        const normalized = asObject<CalendarValue>(row.normalizedValues);
        if (normalized.coordinatorName !== parsed.coordinatorName) {
          await transaction.importRow.update({
            where: { id: row.id },
            data: {
              normalizedValues: {
                ...normalized,
                coordinatorName: parsed.coordinatorName,
              } as Prisma.InputJsonObject,
            },
          });
          actions.calendarRowsRefreshed += 1;
        }
        if (!parsed.coordinatorName || !row.targetId) continue;
        const existing = await transaction.legacyReference.findFirst({
          where: {
            organizationId: access.organizationId,
            importRowId: row.id,
            entityType: 'SESSION',
            entityId: row.targetId,
            sourceField: 'SESSION_COORDINATOR',
            rawValue: parsed.coordinatorName,
          },
          select: { id: true },
        });
        if (existing) continue;
        await transaction.legacyReference.create({
          data: {
            organizationId: access.organizationId,
            importRowId: row.id,
            entityType: 'SESSION',
            entityId: row.targetId,
            sourceField: 'SESSION_COORDINATOR',
            rawValue: parsed.coordinatorName,
          },
        });
        actions.coordinatorReferencesCreated += 1;
      }

      const currentMeta = asObject<Record<string, unknown>>(source.workbookMeta);
      await transaction.importSourceFile.update({
        where: { id: source.id },
        data: {
          workbookMeta: {
            ...currentMeta,
            commentCount: workbook.commentCount,
            commentsIgnored: false,
            evidenceRepair: {
              appliedAt: new Date().toISOString(),
              sourceSha256: workbook.sha256,
            },
          } as Prisma.InputJsonObject,
        },
      });
    },
    { timeout: 120_000 },
  );

  const validationSummary = await validation.validate(access, batch.id);
  const metrics = await prisma.$transaction(async (transaction) => {
    const calculated = await calculateImportMetrics(transaction, access.organizationId, batch.id);
    await saveImportMetrics(transaction, access.organizationId, batch.id, calculated);
    return calculated;
  });
  const report = {
    generatedAt: new Date().toISOString(),
    sourceSha256: workbook.sha256,
    batchId: batch.id,
    commentCount: workbook.commentCount,
    actions,
    validationSummary,
    metrics,
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
