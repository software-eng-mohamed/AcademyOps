import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { PrismaService } from '../platform/database/prisma.service';
import { IdempotencyService } from '../platform/idempotency/idempotency.service';
import { ImportArchiveWriter } from './import-archive-writer';
import { ImportLifecycleEventsService } from './import-lifecycle-events.service';
import { jsonObject } from './import-values';

export type ImportArchiveResult = {
  id: string;
  status: 'VALIDATED';
  archivedRows: number;
  resolvedIssues: number;
  remainingOpenIssues: number;
};

@Injectable()
export class ImportQuarantineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly archiveWriter: ImportArchiveWriter,
    private readonly events: ImportLifecycleEventsService,
  ) {}

  async archive(
    access: AccessContext,
    batchId: string,
    idempotencyKey: string,
    note: string,
  ): Promise<ImportArchiveResult> {
    return this.prisma.serializable(async (transaction) => {
      const batch = await transaction.importBatch.findFirst({
        where: { id: batchId, organizationId: access.organizationId },
      });
      if (!batch) throw this.notFound();
      const attempt = await this.idempotency.begin<ImportArchiveResult>(
        transaction,
        access.organizationId,
        'import.archive_quarantined',
        idempotencyKey,
        { batchId, note },
      );
      if (attempt.replayed) return attempt.response;
      if (!['VALIDATED', 'RECONCILED'].includes(batch.status))
        throw new ConflictException({
          code: 'IMPORT_ARCHIVE_BLOCKED',
          messageKey: 'imports.archiveBlocked',
          batchStatus: batch.status,
        });
      const sourceIds = (
        await transaction.importSourceFile.findMany({
          where: { organizationId: access.organizationId, batchId },
          select: { id: true },
        })
      ).map(({ id }) => id);
      const rows = await transaction.importRow.findMany({
        where: {
          organizationId: access.organizationId,
          sourceFileId: { in: sourceIds },
          disposition: 'QUARANTINED',
        },
        select: {
          id: true,
          sourceFileId: true,
          sheetName: true,
          rowNumber: true,
          rawValues: true,
          disposition: true,
        },
        orderBy: [{ sheetName: 'asc' }, { rowNumber: 'asc' }],
      });
      if (!rows.length) {
        const result = await this.result(transaction, access.organizationId, batchId, 0, 0);
        await this.idempotency.complete(transaction, attempt.recordId, 200, result);
        return result;
      }
      await this.archiveWriter.archive(
        transaction,
        access,
        batchId,
        rows.map((row) => ({ ...row, disposition: 'ARCHIVED' })),
      );
      await transaction.importRow.updateMany({
        where: { id: { in: rows.map(({ id }) => id) }, organizationId: access.organizationId },
        data: { disposition: 'ARCHIVED', normalizedValues: Prisma.JsonNull },
      });
      const resolvedIssues = await this.resolveIssues(
        transaction,
        access,
        batchId,
        rows.map(({ id }) => id),
      );
      await transaction.importReconciliation.deleteMany({
        where: { organizationId: access.organizationId, batchId },
      });
      await transaction.importBatch.update({
        where: { id: batchId },
        data: { status: 'VALIDATED', reconciliation: Prisma.JsonNull },
      });
      const result = await this.result(
        transaction,
        access.organizationId,
        batchId,
        rows.length,
        resolvedIssues,
      );
      await transaction.auditEvent.create({
        data: {
          organizationId: access.organizationId,
          actorUserId: access.actorUserId,
          action: 'IMPORT_QUARANTINED_ROWS_ARCHIVED',
          entityType: 'ImportBatch',
          entityId: batchId,
          correlationId: idempotencyKey,
          after: jsonObject({ ...result, note }),
        },
      });
      await this.events.quarantinedRowsArchived(transaction, access.organizationId, batchId, {
        archivedRows: rows.length,
        resolvedIssues,
        remainingOpenIssues: result.remainingOpenIssues,
      });
      await this.idempotency.complete(transaction, attempt.recordId, 200, result);
      return result;
    });
  }

  private async resolveIssues(
    db: Prisma.TransactionClient,
    access: AccessContext,
    batchId: string,
    rowIds: string[],
  ): Promise<number> {
    let count = 0;
    for (let offset = 0; offset < rowIds.length; offset += 2_000) {
      const resolved = await db.importIssue.updateMany({
        where: {
          organizationId: access.organizationId,
          batchId,
          importRowId: { in: rowIds.slice(offset, offset + 2_000) },
          status: 'OPEN',
        },
        data: { status: 'RESOLVED', resolvedBy: access.actorUserId, resolvedAt: new Date() },
      });
      count += resolved.count;
    }
    return count;
  }

  private async result(
    db: Prisma.TransactionClient,
    organizationId: string,
    batchId: string,
    archivedRows: number,
    resolvedIssues: number,
  ) {
    const remainingOpenIssues = await db.importIssue.count({
      where: { organizationId, batchId, status: 'OPEN' },
    });
    return {
      id: batchId,
      status: 'VALIDATED' as const,
      archivedRows,
      resolvedIssues,
      remainingOpenIssues,
    };
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'IMPORT_BATCH_NOT_FOUND',
      messageKey: 'imports.batchNotFound',
    });
  }
}
