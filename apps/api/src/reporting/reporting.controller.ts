import { Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AccessContext } from '@academyops/contracts';
import { requireIdempotencyKey } from '../common/http/headers';
import { CurrentAccess, RequirePermission } from '../iam/authorization/decorators';
import { ReportExportsService } from './report-exports.service';
import { FinanceReceivablesDto, ListReportExportsDto, ReportRangeDto } from './reporting.dto';
import { ReportingService } from './reporting.service';

@ApiTags('reports')
@Controller({ path: 'reports', version: '1' })
export class ReportingController {
  constructor(
    private readonly reports: ReportingService,
    private readonly exports: ReportExportsService,
  ) {}

  @RequirePermission('reports.operations.read')
  @Get('operations/overview')
  operationsOverview(@CurrentAccess() access: AccessContext, @Query() input: ReportRangeDto) {
    return this.reports.operationsOverview(access, input);
  }

  @RequirePermission('finance.reports.read')
  @Get('finance/receivables')
  financeReceivables(
    @CurrentAccess() access: AccessContext,
    @Query() input: FinanceReceivablesDto,
  ) {
    return this.reports.financeReceivables(access, input);
  }

  @RequirePermission('finance.reports.export')
  @Post('finance/receivables/exports')
  createFinanceReceivablesExport(
    @CurrentAccess() access: AccessContext,
    @Query() input: FinanceReceivablesDto,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.exports.createFinanceReceivables(
      access,
      input,
      requireIdempotencyKey(key),
      correlationId,
    );
  }

  @RequirePermission('finance.reports.export')
  @Get('exports')
  listExports(@CurrentAccess() access: AccessContext, @Query() input: ListReportExportsDto) {
    return this.exports.list(access, input);
  }

  @RequirePermission('finance.reports.export')
  @Get('exports/:id/download')
  downloadExport(@CurrentAccess() access: AccessContext, @Param('id') id: string) {
    return this.exports.download(access, id);
  }
}
