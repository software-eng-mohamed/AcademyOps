import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AccessContext } from '@academyops/contracts';
import { CurrentAccess, RequirePermission } from '../iam/authorization/decorators';
import { DashboardService } from './dashboard.service';
import { DashboardOverviewDto } from './reporting.dto';

@ApiTags('dashboard')
@Controller({ path: 'dashboard', version: '1' })
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @RequirePermission('reports.operations.read')
  @Get('overview')
  overview(@CurrentAccess() access: AccessContext, @Query() input: DashboardOverviewDto) {
    return this.dashboard.overview(access, input);
  }
}
