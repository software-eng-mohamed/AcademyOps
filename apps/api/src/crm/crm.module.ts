import { Module } from '@nestjs/common';
import { PlatformModule } from '../platform/platform.module';
import { BusinessAccountsController } from './business-accounts/business-accounts.controller';
import { BusinessAccountsService } from './business-accounts/business-accounts.service';
import { LeadsController, LeadStagesController } from './leads/leads.controller';
import { LeadsService } from './leads/leads.service';
import { LeadsQueryService } from './leads/leads-query.service';
import { LeadsCommandService } from './leads/leads-command.service';
import { LeadTransitionService } from './leads/lead-transition.service';
import { LeadConversionService } from './leads/lead-conversion.service';
import { LeadStageService } from './leads/lead-stage.service';
import { LeadAccessService } from './leads/lead-access.service';
import { LeadPersonService } from './leads/lead-person.service';
import { SalesDashboardController } from './sales-dashboard/sales-dashboard.controller';
import { SalesDashboardService } from './sales-dashboard/sales-dashboard.service';

@Module({
  imports: [PlatformModule],
  controllers: [
    LeadsController,
    LeadStagesController,
    BusinessAccountsController,
    SalesDashboardController,
  ],
  providers: [
    LeadsService,
    BusinessAccountsService,
    LeadsQueryService,
    LeadsCommandService,
    LeadTransitionService,
    LeadConversionService,
    LeadStageService,
    LeadAccessService,
    LeadPersonService,
    SalesDashboardService,
  ],
})
export class CrmModule {}
