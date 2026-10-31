import type { AccessContext } from '@academyops/contracts';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import { ImportQueryService } from '../src/imports/import-query.service';
import { ImportArchiveWriter } from '../src/imports/import-archive-writer';
import type { ImportLifecycleEventsService } from '../src/imports/import-lifecycle-events.service';
import { ListImportIssuesDto, ResolveImportIssueDto } from '../src/imports/imports.dto';
import type { PrismaService } from '../src/platform/database/prisma.service';

const organizationId = '11111111-1111-4111-8111-111111111111';
const batchId = '22222222-2222-4222-8222-222222222222';

function access(canFinalize = false): AccessContext {
  return {
    organizationId,
    actorUserId: '33333333-3333-4333-8333-333333333333',
    grants: new Map(canFinalize ? [['imports.finalize', new Set(['O'] as const)]] : []),
    branchIds: new Set(),
    assignedResourceIds: new Set(),
  };
}

function queryService() {
  const prisma = {
    importBatch: { findFirst: vi.fn() },
    importSourceFile: { findMany: vi.fn() },
    importRow: { findMany: vi.fn(), groupBy: vi.fn() },
    importIssue: { count: vi.fn(), findMany: vi.fn() },
    importReconciliation: { findMany: vi.fn() },
  };
  return {
    prisma,
    service: new ImportQueryService(
      prisma as unknown as PrismaService,
      {} as ImportLifecycleEventsService,
      new ImportArchiveWriter(),
    ),
  };
}

describe('ImportQueryService read contracts', () => {
  it('serializes source file sizes in batch detail without BigInt JSON failures', async () => {
    const { prisma, service } = queryService();
    prisma.importBatch.findFirst.mockResolvedValue({ id: batchId, organizationId });
    prisma.importSourceFile.findMany.mockResolvedValue([
      { id: 'source-1', batchId, organizationId, sizeBytes: 12_345n },
    ]);
    prisma.importRow.groupBy.mockResolvedValue([]);
    prisma.importIssue.count.mockResolvedValue(0);
    prisma.importReconciliation.findMany.mockResolvedValue([]);

    const result = await service.getBatch(access(), batchId);

    expect(result.sources[0]?.sizeBytes).toBe('12345');
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('never queries or returns row PII to preview-only access', async () => {
    const { prisma, service } = queryService();
    prisma.importBatch.findFirst.mockResolvedValue({ id: batchId });
    prisma.importIssue.findMany.mockResolvedValue([
      {
        id: 'issue-1',
        importRowId: 'row-1',
        organizationId,
        batchId,
        severity: 'CRITICAL',
        code: 'REVIEW',
      },
    ]);

    const result = await service.listIssues(access(), batchId, { limit: 25 });

    expect(result.items[0]?.row).toBeNull();
    expect(prisma.importSourceFile.findMany).not.toHaveBeenCalled();
    expect(prisma.importRow.findMany).not.toHaveBeenCalled();
  });

  it('filters issues and hydrates all authorized rows with one scoped query', async () => {
    const { prisma, service } = queryService();
    prisma.importBatch.findFirst.mockResolvedValue({ id: batchId });
    prisma.importIssue.findMany.mockResolvedValue([
      { id: 'issue-1', importRowId: 'row-1', organizationId, batchId },
      { id: 'issue-2', importRowId: 'row-2', organizationId, batchId },
    ]);
    prisma.importSourceFile.findMany.mockResolvedValue([{ id: 'source-1' }]);
    prisma.importRow.findMany.mockResolvedValue([
      {
        id: 'row-1',
        sheetName: 'Master Sheet',
        rowNumber: 2,
        disposition: 'QUARANTINED',
        targetType: null,
        targetId: null,
        rawValues: { name: 'Student' },
        normalizedValues: { name: 'Student' },
      },
    ]);

    const result = await service.listIssues(access(true), batchId, {
      limit: 25,
      status: 'OPEN',
      severity: 'CRITICAL',
      code: 'REVIEW_REQUIRED',
    });

    expect(prisma.importIssue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId,
          batchId,
          status: 'OPEN',
          severity: 'CRITICAL',
          code: 'REVIEW_REQUIRED',
        },
      }),
    );
    expect(prisma.importRow.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.importRow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId,
          sourceFileId: { in: ['source-1'] },
          id: { in: ['row-1', 'row-2'] },
        },
      }),
    );
    expect(result.items[0]?.row).toMatchObject({ id: 'row-1', disposition: 'QUARANTINED' });
    expect(result.items[1]?.row).toBeNull();
  });

  it('validates supported severity and normalized issue codes', async () => {
    const invalid = Object.assign(new ListImportIssuesDto(), {
      severity: 'URGENT',
      code: 'contains spaces',
    });
    const properties = (await validate(invalid)).map(({ property }) => property);

    expect(properties).toContain('severity');
    expect(properties).toContain('code');
  });

  it('requires a versioned row and issue fingerprint for correction decisions', async () => {
    const legacy = Object.assign(new ResolveImportIssueDto(), {
      disposition: 'READY',
      normalizedValues: { name: 'Student' },
      note: 'Corrected',
    });
    const invalidProperties = (await validate(legacy)).map(({ property }) => property);
    expect(invalidProperties).toEqual(
      expect.arrayContaining([
        'schemaVersion',
        'decision',
        'expectedRowHash',
        'expectedIssueCode',
        'expectedIssueVersion',
      ]),
    );
    const current = Object.assign(new ResolveImportIssueDto(), {
      schemaVersion: 'plg-import-correction/v1',
      decision: 'CORRECT',
      expectedRowHash: 'a'.repeat(64),
      expectedIssueCode: 'STUDENT_NAME_REQUIRED',
      expectedIssueVersion: 1,
      correction: { kind: 'ROW_VALUES', values: { name: 'Student' } },
      note: 'Corrected',
    });
    expect(await validate(current)).toEqual([]);
  });
});
