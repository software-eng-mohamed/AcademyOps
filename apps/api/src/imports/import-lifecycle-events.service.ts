import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { OutboxService } from '../platform/outbox/outbox.service';

type Db = Prisma.TransactionClient;
type Counts = Record<string, number>;

@Injectable()
export class ImportLifecycleEventsService {
  constructor(private readonly outbox: OutboxService) {}

  staged(db: Db, organizationId: string, batchId: string, rows: number): Promise<void> {
    return this.addOnce(db, organizationId, batchId, 'imports.batch.staged', 'STAGED', {
      rows,
    });
  }

  validated(db: Db, organizationId: string, batchId: string): Promise<void> {
    return this.addOnce(db, organizationId, batchId, 'imports.batch.validated', 'VALIDATED');
  }

  issueResolved(
    db: Db,
    organizationId: string,
    batchId: string,
    issueId: string,
    resolvedIssues: number,
  ): Promise<void> {
    return this.addOnce(
      db,
      organizationId,
      batchId,
      'imports.batch.issue_resolved',
      'VALIDATED',
      { resolvedIssues },
      issueId,
    );
  }

  reconciled(
    db: Db,
    organizationId: string,
    batchId: string,
    status: 'RECONCILED' | 'VALIDATED',
  ): Promise<void> {
    return this.addOnce(db, organizationId, batchId, 'imports.batch.reconciled', status);
  }

  readyRowsPromoted(
    db: Db,
    organizationId: string,
    batchId: string,
    counts: { promotedRows: number; quarantinedRows: number; openIssues: number },
  ): Promise<void> {
    return this.addOnce(
      db,
      organizationId,
      batchId,
      'imports.batch.ready_rows_promoted',
      'VALIDATED',
      counts,
    );
  }

  quarantinedRowsArchived(
    db: Db,
    organizationId: string,
    batchId: string,
    counts: { archivedRows: number; resolvedIssues: number; remainingOpenIssues: number },
  ): Promise<void> {
    return this.addOnce(
      db,
      organizationId,
      batchId,
      'imports.batch.quarantined_rows_archived',
      'VALIDATED',
      counts,
    );
  }

  finalized(db: Db, organizationId: string, batchId: string): Promise<void> {
    return this.addOnce(db, organizationId, batchId, 'imports.batch.finalized', 'FINALIZED');
  }

  private async addOnce(
    db: Db,
    organizationId: string,
    batchId: string,
    type: string,
    status: string,
    counts?: Counts,
    issueId?: string,
  ): Promise<void> {
    const duplicate = await db.outboxEvent.findFirst({
      where: {
        organizationId,
        aggregateType: 'ImportBatch',
        aggregateId: batchId,
        type,
        payload: { path: ['status'], equals: status },
        ...(issueId ? { payload: { path: ['issueId'], equals: issueId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) return;
    await this.outbox.add(db, {
      organizationId,
      aggregateType: 'ImportBatch',
      aggregateId: batchId,
      type,
      payload: {
        batchId,
        status,
        ...(counts ? { counts } : {}),
        ...(issueId ? { issueId } : {}),
      },
    });
  }
}
