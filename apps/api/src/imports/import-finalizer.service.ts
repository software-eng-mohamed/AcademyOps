import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { IdempotencyService } from '../platform/idempotency/idempotency.service';
import { PrismaService } from '../platform/database/prisma.service';
import { ImportAttendanceWriter } from './import-attendance-writer';
import { ImportCatalogWriter } from './import-catalog-writer';
import { ImportQueryService } from './import-query.service';
import { ImportLifecycleEventsService } from './import-lifecycle-events.service';
import type { ImportMetric } from './import-reconciliation';
import { ImportStudentWriter } from './import-student-writer';
import { jsonObject } from './import-values';

export type ImportPromoteResult =
  | { id: string; status: 'FINALIZED'; promotedRows: number; replayed: true }
  | {
      id: string;
      status: 'VALIDATED';
      partial: boolean;
      promotedRows: number;
      quarantinedRows: number;
      openIssues: number;
    };

export type ImportFinalizeResult =
  | { id: string; status: 'FINALIZED'; replayed: true }
  | { id: string; status: 'FINALIZED'; metrics: ImportMetric[] };

@Injectable()
export class ImportFinalizerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly catalog: ImportCatalogWriter,
    private readonly students: ImportStudentWriter,
    private readonly attendance: ImportAttendanceWriter,
    private readonly queries: ImportQueryService,
    private readonly events: ImportLifecycleEventsService,
  ) {}

  async promote(
    access: AccessContext,
    batchId: string,
    idempotencyKey: string,
  ): Promise<ImportPromoteResult> {
    return this.serializable<ImportPromoteResult>(async (transaction) => {
      const batch = await transaction.importBatch.findFirst({
        where: { id: batchId, organizationId: access.organizationId },
      });
      if (!batch)
        throw new NotFoundException({
          code: 'IMPORT_BATCH_NOT_FOUND',
          messageKey: 'imports.batchNotFound',
        });
      const attempt = await this.idempotency.begin<ImportPromoteResult>(
        transaction,
        access.organizationId,
        'import.promote',
        idempotencyKey,
        { batchId },
      );
      if (attempt.replayed) return attempt.response;
      if (batch.status === 'FINALIZED') {
        const replay: ImportPromoteResult = {
          id: batch.id,
          status: 'FINALIZED',
          promotedRows: 0,
          replayed: true,
        };
        await this.idempotency.complete(transaction, attempt.recordId, 200, replay);
        return replay;
      }
      const sourceIds = (
        await transaction.importSourceFile.findMany({
          where: { organizationId: access.organizationId, batchId },
          select: { id: true },
        })
      ).map((source) => source.id);
      const [stagedRows, quarantinedRows, openIssues, readyRows] = await Promise.all([
        transaction.importRow.count({
          where: {
            organizationId: access.organizationId,
            sourceFileId: { in: sourceIds },
            disposition: 'STAGED',
          },
        }),
        transaction.importRow.count({
          where: {
            organizationId: access.organizationId,
            sourceFileId: { in: sourceIds },
            disposition: 'QUARANTINED',
          },
        }),
        transaction.importIssue.count({
          where: { organizationId: access.organizationId, batchId, status: 'OPEN' },
        }),
        transaction.importRow.findMany({
          where: {
            organizationId: access.organizationId,
            sourceFileId: { in: sourceIds },
            disposition: 'READY',
          },
          select: { id: true, rowHash: true, sheetName: true, normalizedValues: true },
          orderBy: [{ sheetName: 'asc' }, { rowNumber: 'asc' }],
        }),
      ]);
      if (!['VALIDATED', 'RECONCILED'].includes(batch.status) || stagedRows) {
        throw new ConflictException({
          code: 'IMPORT_NOT_READY',
          messageKey: 'imports.notReady',
          fieldErrors: [
            { field: 'batchStatus', messageKey: batch.status },
            { field: 'stagedRows', messageKey: String(stagedRows) },
          ],
        });
      }
      const calendarRows = readyRows.filter((row) => row.sheetName.startsWith('Annual Calendar'));
      const masterRows = readyRows.filter((row) => row.sheetName === 'Master Sheet');
      const attendanceRows = readyRows.filter((row) => row.sheetName === 'Attendance & Cert.');
      await this.catalog.writeCalendar(transaction, access, calendarRows);
      await this.students.write(transaction, access, masterRows);
      await this.attendance.write(transaction, access, attendanceRows);
      const metrics = await this.queries.calculate(transaction, access.organizationId, batchId);
      if (
        !metrics
          .filter((metric) => metric.metric.startsWith('domain.'))
          .every((metric) => metric.passed)
      ) {
        throw new ConflictException({
          code: 'IMPORT_RECONCILIATION_FAILED',
          messageKey: 'imports.reconciliationFailed',
          metrics,
        });
      }
      await this.queries.save(transaction, access.organizationId, batchId, metrics);
      const attemptedAt = new Date();
      await transaction.importBatch.update({
        where: { id: batchId },
        data: {
          status: 'VALIDATED',
          reconciliation: jsonObject({
            promoted: true,
            attemptedAt: attemptedAt.toISOString(),
            metrics,
          }),
        },
      });
      await transaction.auditEvent.create({
        data: {
          organizationId: access.organizationId,
          actorUserId: access.actorUserId,
          action: 'IMPORT_READY_ROWS_PROMOTED',
          entityType: 'ImportBatch',
          entityId: batchId,
          correlationId: idempotencyKey,
          after: jsonObject({
            promotedRows: readyRows.length,
            quarantinedRows,
            openIssues,
            metrics,
          }),
        },
      });
      await this.events.readyRowsPromoted(transaction, access.organizationId, batchId, {
        promotedRows: readyRows.length,
        quarantinedRows,
        openIssues,
      });
      const result: ImportPromoteResult = {
        id: batchId,
        status: 'VALIDATED',
        partial: quarantinedRows > 0 || openIssues > 0,
        promotedRows: readyRows.length,
        quarantinedRows,
        openIssues,
      };
      await this.idempotency.complete(transaction, attempt.recordId, 200, result);
      return result;
    }, 15 * 60_000);
  }

  async finalize(
    access: AccessContext,
    batchId: string,
    idempotencyKey: string,
  ): Promise<ImportFinalizeResult> {
    return this.serializable<ImportFinalizeResult>(async (transaction) => {
      const batch = await transaction.importBatch.findFirst({
        where: { id: batchId, organizationId: access.organizationId },
      });
      if (!batch)
        throw new NotFoundException({
          code: 'IMPORT_BATCH_NOT_FOUND',
          messageKey: 'imports.batchNotFound',
        });
      const attempt = await this.idempotency.begin<ImportFinalizeResult>(
        transaction,
        access.organizationId,
        'import.finalize',
        idempotencyKey,
        { batchId },
      );
      if (attempt.replayed) return attempt.response;
      if (batch.status === 'FINALIZED') {
        const replay: ImportFinalizeResult = {
          id: batch.id,
          status: 'FINALIZED',
          replayed: true,
        };
        await this.idempotency.complete(transaction, attempt.recordId, 200, replay);
        return replay;
      }
      const sourceIds = (
        await transaction.importSourceFile.findMany({
          where: { organizationId: access.organizationId, batchId },
          select: { id: true },
        })
      ).map((source) => source.id);
      const [unresolvedRows, openIssues] = await Promise.all([
        transaction.importRow.count({
          where: {
            organizationId: access.organizationId,
            sourceFileId: { in: sourceIds },
            disposition: { in: ['STAGED', 'READY', 'QUARANTINED'] },
          },
        }),
        transaction.importIssue.count({
          where: {
            organizationId: access.organizationId,
            batchId,
            status: 'OPEN',
            severity: { in: ['CRITICAL', 'HIGH'] },
          },
        }),
      ]);
      const metrics = await this.queries.calculate(transaction, access.organizationId, batchId);
      if (
        batch.status !== 'RECONCILED' ||
        unresolvedRows ||
        openIssues ||
        !metrics.every((metric) => metric.passed)
      )
        throw new ConflictException({
          code: 'IMPORT_FINALIZATION_BLOCKED',
          messageKey: 'imports.finalizationBlocked',
          unresolvedRows,
          openIssues,
          batchStatus: batch.status,
          metrics,
        });
      const finalizedAt = new Date();
      await this.queries.save(transaction, access.organizationId, batchId, metrics);
      await transaction.importBatch.update({
        where: { id: batchId },
        data: {
          status: 'FINALIZED',
          finalizedAt,
          finalizedBy: access.actorUserId,
          reconciliation: jsonObject({
            passed: true,
            finalizedAt: finalizedAt.toISOString(),
            metrics,
          }),
        },
      });
      await this.events.finalized(transaction, access.organizationId, batchId);
      const result: ImportFinalizeResult = { id: batchId, status: 'FINALIZED', metrics };
      await this.idempotency.complete(transaction, attempt.recordId, 200, result);
      return result;
    }, 120_000);
  }

  private async serializable<T>(
    work: (transaction: Prisma.TransactionClient) => Promise<T>,
    timeout: number,
  ): Promise<T> {
    const maximumAttempts = 7;
    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout,
        });
      } catch (error) {
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2034' || String(error.meta?.code) === '40001');
        if (!retryable || attempt === maximumAttempts) throw error;
        await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** (attempt - 1)));
      }
    }
    throw new Error('Import transaction retry loop exhausted');
  }
}
