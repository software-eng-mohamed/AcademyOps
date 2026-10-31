import assert from 'node:assert/strict';
import { FileStorageService } from '../../src/platform/files/file-storage.service';
import { runFinanceDocumentsHttpStep } from './finance-documents-http.step';
import { post } from './finance-http-client';
import { seedFinanceHttpFixture } from './finance-http-fixture';
import { runHttpScenario } from './http-test-harness';
import { runPaymentsHttpStep } from './payments-http.step';
import { runPricingHttpStep } from './pricing-http.step';
import { runReportsWorkspaceHttpStep } from './reports-workspace-http.step';
import { runFinanceRequestDecisionsHttpStep } from './finance-request-decisions-http.step';

const permissions = [
  'pricing.read',
  'pricing.propose',
  'discounts.approve_tier1',
  'discounts.approve_tier2',
  'payments.read',
  'payments.record',
  'payments.verify',
  'payments.reverse.request',
  'payments.reverse.approve',
  'refunds.request',
  'refunds.approve',
  'invoices.read',
  'invoices.issue',
  'receipts.read',
  'receipts.issue',
  'payments.checkout',
  'finance.balance.read',
  'finance.reports.read',
  'finance.reports.export',
  'reports.operations.read',
  'leads.read',
  'exports.sensitive',
] as const;

export async function runFinanceHttpScenario(): Promise<void> {
  await runHttpScenario(
    {
      permissions: [...permissions],
      roleCode: 'OWNER',
      overrides: [
        {
          token: FileStorageService,
          value: {
            createDownloadUrl: (asset: { id: string }) => ({
              url: `https://files.invalid/${asset.id}`,
              expiresAt: new Date(Date.now() + 300_000).toISOString(),
            }),
          },
        },
      ],
    },
    async (context) => {
      const fixture = await seedFinanceHttpFixture(context);
      const scheduleId = await runPricingHttpStep(context, fixture);
      const payment = await runPaymentsHttpStep(context, fixture, scheduleId);
      await runFinanceDocumentsHttpStep(context, fixture);
      await runReportsWorkspaceHttpStep(context, fixture, payment);
      await runFinanceRequestDecisionsHttpStep(context, fixture);
    },
  );
  await runFinanceRoleDenial();
}

async function runFinanceRoleDenial(): Promise<void> {
  await runHttpScenario(
    { permissions: ['payments.read'], roleCode: 'FINANCE_VIEWER' },
    async (context) => {
      const denied = await post(
        context,
        'payments',
        {},
        { 'idempotency-key': 'role-denial-never-reaches-service' },
      );
      assert.equal(denied.status, 403);
      assert.equal(((await denied.json()) as { code: string }).code, 'PERMISSION_DENIED');
    },
  );
}
