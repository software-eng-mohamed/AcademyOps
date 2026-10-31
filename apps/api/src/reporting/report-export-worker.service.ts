import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AuditService } from '../platform/audit/audit.service';
import { PrismaService } from '../platform/database/prisma.service';
import { FileStorageService } from '../platform/files/file-storage.service';
import { OutboxService } from '../platform/outbox/outbox.service';
import { ReportingQueryService, type ReceivableRow } from './reporting-query.service';

export function escapeCsvCell(raw: string): string {
  let firstVisible = 0;
  while (firstVisible < raw.length && raw.charCodeAt(firstVisible) <= 0x20) firstVisible += 1;
  const safe = ['=', '+', '-', '@'].includes(raw[firstVisible] ?? '') ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

@Injectable()
export class ReportExportWorkerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queries: ReportingQueryService,
    private readonly files: FileStorageService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async process(exportJobId: string): Promise<void> {
    const job = await this.start(exportJobId);
    if (!job) return;
    if (job.reportType !== 'FINANCE_RECEIVABLES') throw new Error('Unsupported report export type');
    const enrollmentIds = this.enrollmentScope(job.scopeSnapshot);
    const asOfExclusive = this.asOfExclusive(job.parameters);
    const rows = await this.queries.receivableRows(
      job.organizationId,
      enrollmentIds,
      asOfExclusive,
    );
    const bytes = this.receivablesCsv(rows);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const storageKey = `reports/${job.organizationId}/${job.id}/${sha256}.csv`;
    const stored = await this.files.putPrivate(storageKey, bytes, 'text/csv; charset=utf-8');

    await this.prisma.serializable(async (transaction) => {
      await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id::text FROM report_export_jobs WHERE id = ${job.id}::uuid FOR UPDATE
      `;
      const current = await transaction.reportExportJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      if (current.status === 'AVAILABLE') return;
      if (current.status !== 'RUNNING') throw new Error('Report export job is not running');
      const existingAsset = await transaction.fileAsset.findFirst({
        where: { organizationId: current.organizationId, storageKey },
      });
      const asset =
        existingAsset ??
        (await transaction.fileAsset.create({
          data: {
            organizationId: current.organizationId,
            storageKey: stored.storageKey,
            contentType: 'text/csv; charset=utf-8',
            sizeBytes: stored.sizeBytes,
            sha256,
            classification: 'PRIVATE',
            scanStatus: 'CLEAN',
            createdBy: current.requestedBy,
          },
        }));
      const completedAt = new Date();
      const updated = await transaction.reportExportJob.update({
        where: { id: current.id },
        data: {
          status: 'AVAILABLE',
          fileAssetId: asset.id,
          completedAt,
          version: { increment: 1 },
        },
      });
      await this.audit.write(transaction, {
        organizationId: current.organizationId,
        actorUserId: current.requestedBy,
        action: 'report.export.available',
        entityType: 'ReportExportJob',
        entityId: current.id,
        correlationId: `worker:report-export:${current.id}:${current.version}`,
        after: { fileAssetId: asset.id, sha256, rowCount: rows.length, version: updated.version },
      });
      await this.outbox.add(transaction, {
        organizationId: current.organizationId,
        aggregateType: 'ReportExportJob',
        aggregateId: current.id,
        type: 'report.export.available',
        payload: { exportJobId: current.id, fileAssetId: asset.id },
      });
      await transaction.userNotification.upsert({
        where: {
          organizationId_userId_eventKey: {
            organizationId: current.organizationId,
            userId: current.requestedBy,
            eventKey: `report-export:${current.id}:available`,
          },
        },
        update: {},
        create: {
          organizationId: current.organizationId,
          userId: current.requestedBy,
          eventKey: `report-export:${current.id}:available`,
          type: 'REPORT_EXPORT_AVAILABLE',
          subjectType: 'ReportExportJob',
          subjectId: current.id,
          payload: { reportType: current.reportType, fileAssetId: asset.id },
        },
      });
    });
  }

  async markFailed(exportJobId: string): Promise<void> {
    await this.prisma.serializable(async (transaction) => {
      await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id::text FROM report_export_jobs WHERE id = ${exportJobId}::uuid FOR UPDATE
      `;
      const job = await transaction.reportExportJob.findUnique({ where: { id: exportJobId } });
      if (!job || !['QUEUED', 'RUNNING'].includes(job.status)) return;
      const message = 'Report export failed';
      await transaction.reportExportJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errorMessage: message,
          completedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await this.audit.write(transaction, {
        organizationId: job.organizationId,
        actorUserId: job.requestedBy,
        action: 'report.export.failed',
        entityType: 'ReportExportJob',
        entityId: job.id,
        correlationId: `worker:report-export-failed:${job.id}:${job.version}`,
        after: { reason: message },
      });
      await transaction.userNotification.upsert({
        where: {
          organizationId_userId_eventKey: {
            organizationId: job.organizationId,
            userId: job.requestedBy,
            eventKey: `report-export:${job.id}:failed`,
          },
        },
        update: {},
        create: {
          organizationId: job.organizationId,
          userId: job.requestedBy,
          eventKey: `report-export:${job.id}:failed`,
          type: 'REPORT_EXPORT_FAILED',
          subjectType: 'ReportExportJob',
          subjectId: job.id,
          payload: { reportType: job.reportType },
        },
      });
    });
  }

  private async start(exportJobId: string) {
    return this.prisma.serializable(async (transaction) => {
      await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id::text FROM report_export_jobs WHERE id = ${exportJobId}::uuid FOR UPDATE
      `;
      const job = await transaction.reportExportJob.findUnique({ where: { id: exportJobId } });
      if (!job || ['AVAILABLE', 'FAILED'].includes(job.status)) return null;
      if (job.status === 'RUNNING') return job;
      return transaction.reportExportJob.update({
        where: { id: job.id },
        data: { status: 'RUNNING', startedAt: new Date(), version: { increment: 1 } },
      });
    });
  }

  private enrollmentScope(scopeSnapshot: unknown): string[] | null {
    if (!scopeSnapshot || typeof scopeSnapshot !== 'object' || Array.isArray(scopeSnapshot)) {
      throw new Error('Invalid report export scope snapshot');
    }
    const enrollmentIds = (scopeSnapshot as { enrollmentIds?: unknown }).enrollmentIds;
    if (enrollmentIds === null) return null;
    if (
      !Array.isArray(enrollmentIds) ||
      !enrollmentIds.every(
        (id) =>
          typeof id === 'string' &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id),
      )
    ) {
      throw new Error('Invalid report export enrollment scope');
    }
    return enrollmentIds.map((id) => String(id));
  }

  private asOfExclusive(parameters: unknown): Date {
    if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
      throw new Error('Invalid report export parameters');
    }
    const asOf = (parameters as { asOf?: unknown }).asOf;
    if (typeof asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
      throw new Error('Invalid report export as-of date');
    }
    const start = new Date(`${asOf}T00:00:00.000Z`);
    if (!Number.isFinite(start.getTime())) throw new Error('Invalid report export as-of date');
    return new Date(start.getTime() + 86_400_000);
  }

  private receivablesCsv(rows: ReceivableRow[]): Buffer {
    const header = [
      'enrollment_id',
      'student_public_id',
      'student_name',
      'branch_code',
      'enrollment_state',
      'debits_egp',
      'allocated_egp',
      'outstanding_egp',
    ];
    const lines = [
      header.map((value) => this.csv(value)).join(','),
      ...rows.map((row) =>
        [
          row.enrollmentId,
          row.studentPublicId,
          row.studentName ?? '',
          row.branchCode,
          row.enrollmentState,
          row.debits,
          row.allocated,
          row.outstanding,
        ]
          .map((value) => this.csv(value))
          .join(','),
      ),
    ];
    return Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8');
  }

  private csv(raw: string): string {
    return escapeCsvCell(raw);
  }
}
