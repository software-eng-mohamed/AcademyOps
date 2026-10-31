import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import type { PrismaService } from '../platform/database/prisma.service';
import type { ImportLifecycleEventsService } from './import-lifecycle-events.service';
import type { ImportArchiveWriter } from './import-archive-writer';
import {
  correctionValidationCodes,
  IMPORT_CORRECTION_SCHEMA,
  parseCorrectedRowValues,
  parseImportCorrection,
  type ImportCorrectionRow,
} from './import-correction-validation';
import {
  assertCorrectionEnvelope,
  issueVersion,
  changedFields,
  savePersonMapping,
  invalidCorrection,
} from './import-correction-support';
import type { ResolveImportIssueDto } from './imports.dto';
import { jsonObject } from './import-values';

export class ImportIssueResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ImportLifecycleEventsService,
    private readonly archiveWriter: ImportArchiveWriter,
  ) {}
  async resolveIssue(
    access: AccessContext,
    batchId: string,
    issueId: string,
    body: ResolveImportIssueDto,
  ) {
    return this.prisma.serializable(async (transaction) => {
      const issue = await transaction.importIssue.findFirst({
        where: { id: issueId, batchId, organizationId: access.organizationId, status: 'OPEN' },
      });
      if (!issue?.importRowId)
        throw new NotFoundException({
          code: 'IMPORT_ISSUE_NOT_FOUND',
          messageKey: 'imports.issueNotFound',
        });
      const row = await transaction.importRow.findFirst({
        where: { id: issue.importRowId, organizationId: access.organizationId },
      });
      if (!row)
        throw new NotFoundException({
          code: 'IMPORT_ROW_NOT_FOUND',
          messageKey: 'imports.rowNotFound',
        });
      assertCorrectionEnvelope(issue, row, body);
      const originalDetails =
        issue.details && typeof issue.details === 'object' && !Array.isArray(issue.details)
          ? issue.details
          : {};
      let normalizedValues = row.normalizedValues;
      let disposition = row.disposition;
      let correction: ReturnType<typeof parseImportCorrection> | null = null;
      const currentOpenIssues = await transaction.importIssue.findMany({
        where: {
          organizationId: access.organizationId,
          batchId,
          importRowId: row.id,
          status: 'OPEN',
        },
        select: { code: true },
      });
      const currentCodes = new Set(currentOpenIssues.map(({ code }) => code));
      if (body.decision === 'EXCLUDE') {
        if (body.correction)
          throw invalidCorrection('correction', 'Excluded rows cannot contain corrections');
        // Use the same encrypted, provenance-preserving archive as bulk quarantine.
        // A disposition flag alone makes the row disappear without a readable archive.
        await this.archiveWriter.archive(transaction, access, batchId, [
          { ...row, disposition: 'ARCHIVED' },
        ]);
        normalizedValues = null;
        disposition = 'ARCHIVED';
      } else {
        if (!body.correction)
          throw invalidCorrection('correction', 'A correction value is required');
        correction = parseImportCorrection(body.correction);
        if (correction.kind === 'PERSON_MAPPING') {
          if (issue.code !== 'PERSON_IDENTITY_REVIEW_REQUIRED')
            throw invalidCorrection('correction.kind', 'Person mapping is not valid here');
          await savePersonMapping(transaction, access, row, issue.code, correction);
          disposition =
            currentOpenIssues.length === 1 && currentCodes.has(issue.code)
              ? 'READY'
              : 'QUARANTINED';
        } else {
          const corrected = parseCorrectedRowValues(row.sheetName, correction.values);
          const sourceIds = (
            await transaction.importSourceFile.findMany({
              where: { organizationId: access.organizationId, batchId },
              select: { id: true },
            })
          ).map(({ id }) => id);
          const rows = (await transaction.importRow.findMany({
            where: { organizationId: access.organizationId, sourceFileId: { in: sourceIds } },
            select: {
              id: true,
              sheetName: true,
              rowNumber: true,
              rowHash: true,
              rawValues: true,
              normalizedValues: true,
              disposition: true,
            },
          })) as ImportCorrectionRow[];
          const codes = correctionValidationCodes(rows, row.id, corrected);
          if (codes.includes(issue.code))
            throw new ConflictException({
              code: 'IMPORT_ISSUE_NOT_RESOLVED',
              messageKey: 'imports.issueNotResolved',
              remainingCodes: codes,
            });
          const introducedCodes = codes.filter((code) => !currentCodes.has(code));
          if (introducedCodes.length)
            throw new ConflictException({
              code: 'IMPORT_CORRECTION_INTRODUCES_ISSUES',
              messageKey: 'imports.correctionIntroducesIssues',
              introducedCodes,
            });
          normalizedValues = corrected;
          disposition =
            currentOpenIssues.length === 1 && currentCodes.has(issue.code)
              ? 'READY'
              : 'QUARANTINED';
        }
      }
      await transaction.importRow.update({
        where: { id: row.id },
        data: {
          normalizedValues: normalizedValues === null ? Prisma.JsonNull : normalizedValues,
          disposition,
        },
      });
      const resolvedAt = new Date();
      await transaction.importIssue.update({
        where: { id: issue.id },
        data: {
          status: 'RESOLVED',
          resolvedBy: access.actorUserId,
          resolvedAt,
          details: jsonObject({
            ...originalDetails,
            ruleVersion: issueVersion(issue.details),
            resolution: {
              schemaVersion: IMPORT_CORRECTION_SCHEMA,
              decision: body.decision,
              expectedRowHash: body.expectedRowHash,
              expectedIssueCode: body.expectedIssueCode,
              expectedIssueVersion: body.expectedIssueVersion,
              note: body.note,
              correction,
              actorUserId: access.actorUserId,
              resolvedAt: resolvedAt.toISOString(),
            },
          }),
        },
      });
      await transaction.importReconciliation.deleteMany({
        where: { organizationId: access.organizationId, batchId },
      });
      await transaction.importBatch.update({
        where: { id: batchId },
        data: { status: 'VALIDATED', reconciliation: Prisma.JsonNull },
      });
      await transaction.auditEvent.create({
        data: {
          organizationId: access.organizationId,
          actorUserId: access.actorUserId,
          action: 'IMPORT_ISSUE_DECIDED',
          entityType: 'ImportIssue',
          entityId: issue.id,
          correlationId: `${batchId}:${issue.id}`,
          before: jsonObject({
            status: issue.status,
            rowHash: row.rowHash,
            disposition: row.disposition,
          }),
          after: jsonObject({
            status: 'RESOLVED',
            decision: body.decision,
            disposition,
            correctionKind: correction?.kind ?? null,
            changedFields:
              correction?.kind === 'ROW_VALUES'
                ? changedFields(row.normalizedValues, normalizedValues)
                : [],
            mappedPersonId:
              correction?.kind === 'PERSON_MAPPING' && correction.action === 'MATCH_EXISTING'
                ? correction.personId
                : null,
          }),
          metadata: jsonObject({
            schemaVersion: IMPORT_CORRECTION_SCHEMA,
            issueCode: issue.code,
            issueVersion: body.expectedIssueVersion,
            note: body.note,
          }),
        },
      });
      await this.events.issueResolved(transaction, access.organizationId, batchId, issueId, 1);
      return {
        id: issueId,
        rowId: row.id,
        decision: body.decision,
        disposition,
        status: 'RESOLVED',
      };
    });
  }
}
