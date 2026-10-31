import type { AccessContext } from '@academyops/contracts';
import { PricingAgreementService } from '../../src/finance/pricing/pricing-agreement.service';
import { PricingApprovalService } from '../../src/finance/pricing/pricing-approval.service';
import { PricingScheduleService } from '../../src/finance/pricing/pricing-schedule.service';
import { PricingHelperService } from '../../src/finance/pricing/pricing-helper.service';
import { FinanceAccessService } from '../../src/finance/finance-access.service';
import { AuditService } from '../../src/platform/audit/audit.service';
import { OutboxService } from '../../src/platform/outbox/outbox.service';
import { IdempotencyService } from '../../src/platform/idempotency/idempotency.service';
import { setupStudentSelfServiceFixture } from './student-self-service-fixture';

export async function setup(transaction: Parameters<typeof setupStudentSelfServiceFixture>[0]) {
  const fx = await setupStudentSelfServiceFixture(transaction);
  const access: AccessContext = {
    organizationId: fx.orgA.id,
    actorUserId: fx.studentAUser.id,
    grants: new Map([
      ['pricing.propose', new Set(['O'])],
      ['discounts.approve_tier1', new Set(['O'])],
    ]),
    branchIds: new Set(),
    assignedResourceIds: new Set(),
  };
  const audit = new AuditService(fx.adapter);
  const outbox = new OutboxService();
  const idem = new IdempotencyService();
  const helper = new PricingHelperService();
  const financeAccess = new FinanceAccessService();
  return {
    ...fx,
    access,
    agreements: new PricingAgreementService(fx.adapter, financeAccess, audit, idem, helper),
    approvals: new PricingApprovalService(fx.adapter, financeAccess, audit, outbox, idem, helper),
    schedules: new PricingScheduleService(fx.adapter, financeAccess, audit, outbox, idem, helper),
  };
}
