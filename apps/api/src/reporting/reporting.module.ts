import { Module } from '@nestjs/common';
import { AcademicModule } from '../academic/academic.module';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { MessagingCoreModule } from '../messaging/messaging-core.module';
import { WorkspaceOverviewController } from './workspace-overview.controller';
import { WorkspaceOverviewService } from './workspace-overview.service';
import { WorkspacePaymentsService } from './workspace-payments.service';
import { WorkspaceInsightsService } from './workspace-insights.service';
import { WorkspaceBusinessInsightsService } from './workspace-business-insights.service';
import { WorkspaceLearningInsightsService } from './workspace-learning-insights.service';
import { StudentOverviewService } from './student-overview.service';
import { StudentOverviewFinanceService } from './student-overview-finance.service';
import { FinanceModule } from '../finance/finance.module';
import { PlatformModule } from '../platform/platform.module';
import { DashboardActivityService } from './dashboard-activity.service';
import { DashboardApprovalsService } from './dashboard-approvals.service';
import { DashboardAttentionService } from './dashboard-attention.service';
import { DashboardBalanceService } from './dashboard-balance.service';
import { DashboardCommercialService } from './dashboard-commercial.service';
import { DashboardController } from './dashboard.controller';
import { DashboardDataService } from './dashboard-data.service';
import { DashboardMetricsService } from './dashboard-metrics.service';
import { DashboardScopeService } from './dashboard-scope.service';
import { DashboardService } from './dashboard.service';
import { ReportExportWorkerService } from './report-export-worker.service';
import { ReportExportsService } from './report-exports.service';
import { ReportingQueryService } from './reporting-query.service';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';

@Module({
  imports: [PlatformModule, FinanceModule, AcademicModule, EnrollmentModule, MessagingCoreModule],
  controllers: [ReportingController, DashboardController, WorkspaceOverviewController],
  providers: [
    WorkspaceOverviewService,
    WorkspacePaymentsService,
    WorkspaceInsightsService,
    WorkspaceBusinessInsightsService,
    WorkspaceLearningInsightsService,
    StudentOverviewService,
    StudentOverviewFinanceService,
    ReportingQueryService,
    ReportingService,
    ReportExportsService,
    ReportExportWorkerService,
    DashboardScopeService,
    DashboardMetricsService,
    DashboardAttentionService,
    DashboardBalanceService,
    DashboardCommercialService,
    DashboardDataService,
    DashboardApprovalsService,
    DashboardActivityService,
    DashboardService,
  ],
  exports: [ReportExportWorkerService],
})
export class ReportingModule {}
