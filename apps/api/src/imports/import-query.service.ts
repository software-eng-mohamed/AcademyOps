import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { PrismaService } from '../platform/database/prisma.service';
import { ImportLifecycleEventsService } from './import-lifecycle-events.service';
import { ImportArchiveWriter } from './import-archive-writer';
import { ImportIssueResolver } from './import-issue-resolver';
import { jsonObject } from './import-values';
import {
  calculateImportMetrics,
  saveImportMetrics,
  type ImportMetric,
} from './import-reconciliation';
import type {
  ListImportBatchesDto,
  ListImportIssuesDto,
  ResolveImportIssueDto,
} from './imports.dto';

type Db = Prisma.TransactionClient;
const issueRowSnapshotSelect = {
  id: true,
  sheetName: true,
  rowNumber: true,
  rowHash: true,
  disposition: true,
  targetType: true,
  targetId: true,
  rawValues: true,
  normalizedValues: true,
} satisfies Prisma.ImportRowSelect;
type IssueRowSnapshot = Prisma.ImportRowGetPayload<{ select: typeof issueRowSnapshotSelect }>;

@Injectable()
export class ImportQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ImportLifecycleEventsService,
    private readonly archiveWriter: ImportArchiveWriter,
  ) {}

  async listBatches(access: AccessContext, query: ListImportBatchesDto) {
    const rows = await this.prisma.importBatch.findMany({
      where: {
        organizationId: access.organizationId,
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    return {
      items: rows.slice(0, query.limit),
      nextCursor: rows.length > query.limit ? (rows[query.limit - 1]?.id ?? null) : null,
    };
  }

  async getBatch(access: AccessContext, batchId: string) {
    const batch = await this.prisma.importBatch.findFirst({
      where: { id: batchId, organizationId: access.organizationId },
    });
    if (!batch) throw this.notFound();
    const sources = await this.prisma.importSourceFile.findMany({
      where: { organizationId: access.organizationId, batchId },
    });
    const sourceIds = sources.map((source) => source.id);
    const [dispositions, openIssues, reconciliation] = await Promise.all([
      this.prisma.importRow.groupBy({
        by: ['disposition'],
        where: { organizationId: access.organizationId, sourceFileId: { in: sourceIds } },
        _count: { _all: true },
      }),
      this.prisma.importIssue.count({
        where: { organizationId: access.organizationId, batchId, status: 'OPEN' },
      }),
      this.prisma.importReconciliation.findMany({
        where: { organizationId: access.organizationId, batchId },
        orderBy: { metric: 'asc' },
      }),
    ]);
    return {
      ...batch,
      sources: sources.map((source) => ({
        ...source,
        sizeBytes: source.sizeBytes.toString(),
      })),
      dispositions: Object.fromEntries(
        dispositions.map((entry) => [entry.disposition, entry._count._all]),
      ),
      openIssues,
      reconciliation,
    };
  }

  async listIssues(access: AccessContext, batchId: string, query: ListImportIssuesDto) {
    await this.assertBatch(access, batchId);
    const rows = await this.prisma.importIssue.findMany({
      where: {
        organizationId: access.organizationId,
        batchId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.severity ? { severity: query.severity } : {}),
        ...(query.code ? { code: query.code } : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const visible = rows.slice(0, query.limit);
    const [rowSnapshots, candidates] = await Promise.all([
      this.issueRowSnapshots(access, batchId, visible),
      this.issueCandidates(access, visible),
    ]);
    return {
      items: visible.map((issue) => ({
        ...issue,
        row: issue.importRowId ? (rowSnapshots.get(issue.importRowId) ?? null) : null,
        candidates: issue.importRowId ? (candidates.get(issue.importRowId) ?? []) : [],
      })),
      nextCursor: rows.length > query.limit ? (rows[query.limit - 1]?.id ?? null) : null,
    };
  }

  private async issueCandidates(
    access: AccessContext,
    issues: Array<{ code: string; importRowId: string | null }>,
  ): Promise<Map<string, unknown[]>> {
    const rowIds = [
      ...new Set(
        issues.flatMap(({ code, importRowId }) =>
          code === 'PERSON_IDENTITY_REVIEW_REQUIRED' && importRowId ? [importRowId] : [],
        ),
      ),
    ];
    if (!access.grants.get('imports.finalize')?.has('O') || !rowIds.length)
      return new Map<string, unknown[]>();
    const matches = await this.prisma.personMatchCandidate.findMany({
      where: { organizationId: access.organizationId, importRowId: { in: rowIds } },
      select: { id: true, importRowId: true, candidatePersonId: true, score: true, reasons: true },
      orderBy: [{ score: 'desc' }, { id: 'asc' }],
    });
    const personIds = matches.flatMap(({ candidatePersonId }) =>
      candidatePersonId ? [candidatePersonId] : [],
    );
    const people = await this.prisma.person.findMany({
      where: { organizationId: access.organizationId, id: { in: personIds } },
      select: { id: true, publicId: true, name: true },
    });
    const peopleById = new Map(people.map((person) => [person.id, person]));
    const byRow = new Map<string, unknown[]>();
    for (const match of matches) {
      if (!match.candidatePersonId || !peopleById.has(match.candidatePersonId)) continue;
      const values = byRow.get(match.importRowId) ?? [];
      values.push({
        id: match.id,
        personId: match.candidatePersonId,
        score: match.score.toString(),
        reasons: match.reasons,
        person: peopleById.get(match.candidatePersonId),
      });
      byRow.set(match.importRowId, values);
    }
    return byRow;
  }

  private async issueRowSnapshots(
    access: AccessContext,
    batchId: string,
    issues: Array<{ importRowId: string | null }>,
  ): Promise<Map<string, IssueRowSnapshot>> {
    const rowIds = [
      ...new Set(issues.flatMap(({ importRowId }) => (importRowId ? [importRowId] : []))),
    ];
    if (!access.grants.get('imports.finalize')?.has('O') || !rowIds.length) return new Map();
    const sourceIds = (
      await this.prisma.importSourceFile.findMany({
        where: { organizationId: access.organizationId, batchId },
        select: { id: true },
      })
    ).map(({ id }) => id);
    const rows = await this.prisma.importRow.findMany({
      where: {
        organizationId: access.organizationId,
        sourceFileId: { in: sourceIds },
        id: { in: rowIds },
      },
      select: issueRowSnapshotSelect,
    });
    return new Map(rows.map((row) => [row.id, row]));
  }

  resolveIssue(
    access: AccessContext,
    batchId: string,
    issueId: string,
    body: ResolveImportIssueDto,
  ) {
    return new ImportIssueResolver(this.prisma, this.events, this.archiveWriter).resolveIssue(
      access,
      batchId,
      issueId,
      body,
    );
  }

  async reconcile(access: AccessContext, batchId: string) {
    await this.assertBatch(access, batchId);
    return this.prisma.$transaction(async (transaction) => {
      const metrics = await this.calculate(transaction, access.organizationId, batchId);
      await this.save(transaction, access.organizationId, batchId, metrics);
      const passed = metrics.every((metric) => metric.passed);
      const batch = await transaction.importBatch.findUniqueOrThrow({ where: { id: batchId } });
      if (batch.status !== 'FINALIZED')
        await transaction.importBatch.update({
          where: { id: batchId },
          data: {
            status: passed ? 'RECONCILED' : 'VALIDATED',
            reconciliation: jsonObject({ passed, metrics }),
          },
        });
      if (batch.status !== 'FINALIZED')
        await this.events.reconciled(
          transaction,
          access.organizationId,
          batchId,
          passed ? 'RECONCILED' : 'VALIDATED',
        );
      return { batchId, passed, metrics };
    });
  }

  calculate(db: Db, organizationId: string, batchId: string): Promise<ImportMetric[]> {
    return calculateImportMetrics(db, organizationId, batchId);
  }

  save(db: Db, organizationId: string, batchId: string, metrics: ImportMetric[]): Promise<void> {
    return saveImportMetrics(db, organizationId, batchId, metrics);
  }

  private async assertBatch(access: AccessContext, batchId: string): Promise<void> {
    if (
      !(await this.prisma.importBatch.findFirst({
        where: { id: batchId, organizationId: access.organizationId },
        select: { id: true },
      }))
    )
      throw this.notFound();
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'IMPORT_BATCH_NOT_FOUND',
      messageKey: 'imports.batchNotFound',
    });
  }
}
