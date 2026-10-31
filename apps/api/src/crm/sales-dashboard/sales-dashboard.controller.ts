import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AccessContext } from '@academyops/contracts';
import { CurrentAccess, RequirePermission } from '../../iam/authorization/decorators';
import { SalesDashboardService } from './sales-dashboard.service';

@ApiTags('dashboard')
@Controller({ path: 'dashboard', version: '1' })
export class SalesDashboardController {
  constructor(private readonly sales: SalesDashboardService) {}

  @RequirePermission('leads.read')
  @ApiOperation({ summary: 'Sales summary and due follow-ups within the caller’s lead scope' })
  @Header('Cache-Control', 'private, no-store')
  @Get('sales')
  overview(@CurrentAccess() access: AccessContext) {
    return this.sales.overview(access);
  }
}
