import type { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ImportLifecycleEventsService } from '../src/imports/import-lifecycle-events.service';
import type { OutboxService } from '../src/platform/outbox/outbox.service';

const organizationId = '11111111-1111-4111-8111-111111111111';
const batchId = '22222222-2222-4222-8222-222222222222';

describe('ImportLifecycleEventsService', () => {
  it('builds sanitized envelopes for every lifecycle mutation', async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const events = new ImportLifecycleEventsService({ add } as unknown as OutboxService);
    const db = database(null);

    await events.staged(db, organizationId, batchId, 7);
    await events.validated(db, organizationId, batchId);
    await events.issueResolved(db, organizationId, batchId, 'issue-a', 2);
    await events.readyRowsPromoted(db, organizationId, batchId, {
      promotedRows: 3,
      quarantinedRows: 1,
      openIssues: 1,
    });
    await events.quarantinedRowsArchived(db, organizationId, batchId, {
      archivedRows: 1,
      resolvedIssues: 2,
      remainingOpenIssues: 0,
    });
    await events.reconciled(db, organizationId, batchId, 'RECONCILED');
    await events.finalized(db, organizationId, batchId);

    expect(add).toHaveBeenCalledTimes(7);
    const inputs = add.mock.calls.map((call) => call[1] as Record<string, unknown>);
    expect(inputs.map(({ type }) => type)).toEqual([
      'imports.batch.staged',
      'imports.batch.validated',
      'imports.batch.issue_resolved',
      'imports.batch.ready_rows_promoted',
      'imports.batch.quarantined_rows_archived',
      'imports.batch.reconciled',
      'imports.batch.finalized',
    ]);
    expect(inputs.map(({ payload }) => payload)).toEqual([
      { batchId, status: 'STAGED', counts: { rows: 7 } },
      { batchId, status: 'VALIDATED' },
      {
        batchId,
        status: 'VALIDATED',
        counts: { resolvedIssues: 2 },
        issueId: 'issue-a',
      },
      {
        batchId,
        status: 'VALIDATED',
        counts: { promotedRows: 3, quarantinedRows: 1, openIssues: 1 },
      },
      {
        batchId,
        status: 'VALIDATED',
        counts: { archivedRows: 1, resolvedIssues: 2, remainingOpenIssues: 0 },
      },
      { batchId, status: 'RECONCILED' },
      { batchId, status: 'FINALIZED' },
    ]);
    expect(JSON.stringify(inputs)).not.toMatch(
      /rawValues|normalizedValues|filename|sha256|email|phone|note|error|metrics/i,
    );
  });

  it('does not enqueue the same logical terminal state twice', async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const events = new ImportLifecycleEventsService({ add } as unknown as OutboxService);

    await events.finalized(database({ id: 'existing' }), organizationId, batchId);

    expect(add).not.toHaveBeenCalled();
  });
});

function database(existing: { id: string } | null): Prisma.TransactionClient {
  return {
    outboxEvent: { findFirst: vi.fn().mockResolvedValue(existing) },
  } as unknown as Prisma.TransactionClient;
}
