import { Injectable } from '@nestjs/common';
import type { AccessContext, StaffOverview, WorkspaceOverviewRole } from '@academyops/contracts';
import { WorkspaceBusinessInsightsService } from './workspace-business-insights.service';
import { WorkspaceLearningInsightsService } from './workspace-learning-insights.service';

@Injectable()
export class WorkspaceInsightsService {
  constructor(
    private readonly business: WorkspaceBusinessInsightsService,
    private readonly learning: WorkspaceLearningInsightsService,
  ) {}

  async read(
    access: AccessContext,
    role: Exclude<WorkspaceOverviewRole, 'STUDENT'>,
    now: Date,
    visibleSessionIds?: string[],
  ): Promise<StaffOverview> {
    switch (role) {
      case 'RECEPTION':
        return this.business.reception(access, now);
      case 'ACCOUNTS':
        return this.business.payments(access, now);
      case 'OTP_OPERATOR':
        return this.business.otp(access, now);
      case 'OPERATIONS': {
        const [insights, registrations] = await Promise.all([
          this.learning.read(access, role, now, visibleSessionIds),
          this.business.registrations(access),
        ]);
        if (insights.kind !== 'OPERATIONS') throw new Error('Unexpected overview projection');
        return { ...insights, registrations };
      }
      default:
        return this.learning.read(access, role, now, visibleSessionIds);
    }
  }
}
