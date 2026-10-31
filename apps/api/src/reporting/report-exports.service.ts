import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { hasFreshStepUp } from '@academyops/contracts';
import { FinanceAccessService } from '../finance/finance-access.service';
import { AuditService } from '../platform/audit/audit.service';
import { PrismaService } from '../platform/database/prisma.service';
import { FileStorageService } from '../platform/files/file-storage.service';
import { IdempotencyService } from '../platform/idempotency/idempotency.service';
import { OutboxService } from '../platform/outbox/outbox.service';
import { FinanceReceivablesDto, ListReportExportsDto } from './reporting.dto';

export type ExportResult = {
  id: string;
  reportType: string;
  status: string;
  version: number;
  expiresAt: string;
};

@Injectable()
export class ReportExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financeAccess: FinanceAccessService,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly files: FileStorageService,
  ) {}

  async createFinanceReceivables(
    access: AccessContext,
    input: FinanceReceivablesDto,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<ExportResult> {
    this.assertSensitiveExport(access);
    return this.prisma.serializable(async (transaction) => {
      let visible = await this.financeAccess.visibleEnrollmentIds(
        transaction,
        access,
        'finance.reports.export',
      );
      if (input.branchId) {
        const scopes = access.grants.get('finance.reports.export');
        if (!scopes?.has('O') && !(scopes?.has('B') && access.branchIds.has(input.branchId))) {
          throw this.notFound();
        }
        const branch = await transaction.branch.findFirst({
          where: { organizationId: access.organizationId, id: input.branchId },
          select: { id: true },
        });
        if (!branch) throw this.notFound();
        const branchEnrollments = await transaction.enrollment.findMany({
          where: { organizationId: access.organizationId, homeBranchId: input.branchId },
          select: { id: true },
        });
        const branchIds = new Set(branchEnrollments.map(({ id }) => id));
        visible =
          visible === undefined ? [...branchIds] : visible.filter((id) => branchIds.has(id));
      }
      const enrollmentIds = visible === undefined ? null : visible;
      const request = {
        reportType: 'FINANCE_RECEIVABLES',
        branchId: input.branchId ?? null,
        asOf: input.asOf?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
        enrollmentIds,
      };
      const attempt = await this.idempotency.begin<ExportResult>(
        transaction,
        access.organizationId,
        'report.export.finance.receivables',
        idempotencyKey,
        request,
      );
      if (attempt.replayed) return attempt.response;
      const job = await transaction.reportExportJob.create({
        data: {
          organizationId: access.organizationId,
          requestedBy: access.actorUserId,
          reportType: 'FINANCE_RECEIVABLES',
          parameters: {
            branchId: input.branchId ?? null,
            asOf: request.asOf,
          },
          scopeSnapshot: { enrollmentIds },
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'report.export.request',
        entityType: 'ReportExportJob',
        entityId: job.id,
        correlationId,
        after: { reportType: job.reportType, parameters: job.parameters },
      });
      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'ReportExportJob',
        aggregateId: job.id,
        type: 'report.export.requested',
        payload: { exportJobId: job.id },
      });
      const result = this.present(job);
      await this.idempotency.complete(transaction, attempt.recordId, 202, result);
      return result;
    });
  }

  async list(access: AccessContext, input: ListReportExportsDto) {
    this.assertSensitiveExport(access);
    const organizationWide = access.grants.get('exports.sensitive')?.has('O') ?? false;
    const jobs = await this.prisma.reportExportJob.findMany({
      where: {
        organizationId: access.organizationId,
        ...(organizationWide ? {} : { requestedBy: access.actorUserId }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });
    const page = jobs.slice(0, input.limit);
    return {
      items: page.map((job) => this.present(job)),
      nextCursor: jobs.length > input.limit ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async download(access: AccessContext, exportJobId: string) {
    this.assertSensitiveExport(access);
    const organizationWide = access.grants.get('exports.sensitive')?.has('O') ?? false;
    const job = await this.prisma.reportExportJob.findFirst({
      where: {
        id: exportJobId,
        organizationId: access.organizationId,
        ...(organizationWide ? {} : { requestedBy: access.actorUserId }),
      },
    });
    if (!job || job.status !== 'AVAILABLE' || !job.fileAssetId || job.expiresAt <= new Date()) {
      throw this.notFound();
    }
    const asset = await this.prisma.fileAsset.findFirst({
      where: {
        id: job.fileAssetId,
        organizationId: access.organizationId,
        classification: 'PRIVATE',
        scanStatus: 'CLEAN',
      },
    });
    if (!asset) throw this.notFound();
    return this.files.createDownloadUrl(asset, 300);
  }

  private assertSensitiveExport(access: AccessContext): void {
    if (!access.grants.has('exports.sensitive')) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        messageKey: 'auth.permissionDenied',
      });
    }
    if (!hasFreshStepUp(access)) {
      throw new ForbiddenException({
        code: 'MFA_STEP_UP_REQUIRED',
        messageKey: 'auth.mfaStepUpRequired',
      });
    }
  }

  private present(job: {
    id: string;
    reportType: string;
    status: string;
    version: number;
    parameters: unknown;
    fileAssetId: string | null;
    errorMessage: string | null;
    createdAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
    expiresAt: Date;
  }): ExportResult & {
    parameters: unknown;
    fileAssetId: string | null;
    errorMessage: string | null;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
  } {
    return {
      id: job.id,
      reportType: job.reportType,
      status: job.status,
      version: job.version,
      parameters: job.parameters,
      fileAssetId: job.fileAssetId,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
      expiresAt: job.expiresAt.toISOString(),
    };
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'REPORT_EXPORT_NOT_FOUND',
      messageKey: 'reports.exportNotFound',
    });
  }
}
