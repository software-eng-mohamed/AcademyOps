import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { FinanceHttpFixture } from './finance-http-fixture';
import type { PaymentHttpEvidence } from './payments-http.step';
import { get, post } from './finance-http-client';
import type { HttpTestContext } from './http-test-harness';
export async function runReportsWorkspaceHttpStep(
  context: HttpTestContext,
  fixture: FinanceHttpFixture,
  payment: PaymentHttpEvidence,
): Promise<void> {
  await proveReports(context, fixture);
  await proveAdditionalDashboards(context);
  await proveExports(context);
  await proveWorkspace(context, fixture, payment.postedPaymentId);
}
async function proveAdditionalDashboards(context: HttpTestContext): Promise<void> {
  const sales = await get(context, 'dashboard/sales');
  assert.equal(sales.status, 200, await sales.clone().text());
  const salesBody = (await sales.json()) as {
    scope: string;
    timezone: string;
    metrics: { openLeads: number };
    insights: { days: unknown[] };
  };
  assert.equal(salesBody.scope, 'ACCESSIBLE');
  assert.equal(salesBody.timezone, 'Africa/Cairo');
  assert.equal(salesBody.metrics.openLeads, 0);
  assert.equal(salesBody.insights.days.length, 28);

  const accounts = await get(context, 'dashboard/workspaces/ACCOUNTS');
  assert.equal(accounts.status, 200, await accounts.clone().text());
  const workspace = (await accounts.json()) as {
    role: string;
    timezone: string;
    metrics: Array<{ key: string; value: number }>;
    queue: { kind: string };
  };
  assert.equal(workspace.role, 'ACCOUNTS');
  assert.equal(workspace.timezone, 'Africa/Cairo');
  assert.equal(workspace.queue.kind, 'PAYMENTS');
  assert.equal(
    workspace.metrics.some(({ key }) => key === 'paymentsThisMonth'),
    true,
  );
  assert.equal(
    workspace.metrics.every(({ value }) => Number.isFinite(value)),
    true,
  );
  const denied = await get(context, 'dashboard/workspaces/ACADEMIC');
  assert.equal(denied.status, 403);
  const invalid = await get(context, 'dashboard/workspaces/INVALID');
  assert.equal(invalid.status, 400);
}
async function proveReports(context: HttpTestContext, fixture: FinanceHttpFixture): Promise<void> {
  const yesterday = dateOffset(-1);
  const tomorrow = dateOffset(1);
  const operations = await get(
    context,
    `reports/operations/overview?from=${yesterday}&to=${tomorrow}&branchId=${context.branchId}`,
  );
  assert.equal(operations.status, 200, await operations.clone().text());
  assert.equal(
    (
      (await operations.json()) as {
        enrollments: {
          total: number;
        };
      }
    ).enrollments.total,
    1,
  );
  const receivables = await get(
    context,
    `reports/finance/receivables?branchId=${context.branchId}&asOf=${tomorrow}`,
  );
  assert.equal(receivables.status, 200, await receivables.clone().text());
  const totals = (await receivables.json()) as {
    enrollmentCount: number;
    totals: {
      debits: string;
      outstanding: string;
    };
  };
  assert.equal(totals.enrollmentCount, 1);
  assert.equal(Number(totals.totals.debits) > 0, true);
  assert.equal(Number(totals.totals.outstanding) >= 0, true);
  const dashboard = await get(context, `dashboard/overview?branchId=${context.branchId}`);
  assert.equal(dashboard.status, 200, await dashboard.clone().text());
  assert.equal(
    (
      (await dashboard.json()) as {
        kpis: {
          currencyCode: string;
        };
      }
    ).kpis.currencyCode,
    'EGP',
  );
  const foreignBranch = await context.prisma.branch.create({
    data: {
      organizationId: (
        await context.prisma.organization.create({
          data: {
            code: `REPORT-X-${randomUUID().slice(0, 8)}`.toUpperCase(),
            name: 'Foreign reports organization',
          },
        })
      ).id,
      code: 'MAIN',
      name: 'Main',
    },
  });
  const hidden = await get(
    context,
    `reports/operations/overview?from=${yesterday}&to=${tomorrow}&branchId=${foreignBranch.id}`,
  );
  assert.equal(hidden.status, 404);
  assert.equal(fixture.enrollmentId.length > 0, true);
}
async function proveExports(context: HttpTestContext): Promise<void> {
  const key = `report-export-${randomUUID()}`;
  const path = `reports/finance/receivables/exports?branchId=${context.branchId}`;
  const createdResponse = await post(context, path, undefined, { 'idempotency-key': key });
  assert.equal(createdResponse.status, 201, await createdResponse.clone().text());
  const created = (await createdResponse.json()) as {
    id: string;
    status: string;
  };
  assert.equal(created.status, 'QUEUED');
  const replay = await post(context, path, undefined, { 'idempotency-key': key });
  assert.equal(replay.status, 201);
  assert.deepEqual(await replay.json(), created);
  const asset = await context.prisma.fileAsset.create({
    data: {
      organizationId: context.organizationId,
      storageKey: `reports/${randomUUID()}.csv`,
      contentType: 'text/csv',
      sizeBytes: 12,
      sha256: 'a'.repeat(64),
      classification: 'PRIVATE',
      scanStatus: 'CLEAN',
      createdBy: context.userId,
    },
  });
  const available = await context.prisma.reportExportJob.create({
    data: {
      organizationId: context.organizationId,
      requestedBy: context.userId,
      reportType: 'FINANCE_RECEIVABLES',
      status: 'AVAILABLE',
      parameters: {},
      scopeSnapshot: { enrollmentIds: null },
      fileAssetId: asset.id,
      startedAt: new Date(Date.now() - 1000),
      completedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  const list = await get(context, 'reports/exports?limit=10');
  assert.equal(list.status, 200, await list.clone().text());
  assert.equal(
    (
      (await list.json()) as {
        items: Array<{
          id: string;
        }>;
      }
    ).items.some(({ id }) => id === created.id),
    true,
  );
  const download = await get(context, `reports/exports/${available.id}/download`);
  assert.equal(download.status, 200, await download.clone().text());
  const downloadBody = (await download.json()) as {
    url: string;
    expiresAt: string;
  };
  assert.equal(downloadBody.url, `https://files.invalid/${asset.id}`);
  assert.equal(Number.isFinite(Date.parse(downloadBody.expiresAt)), true);
}
async function proveWorkspace(
  context: HttpTestContext,
  fixture: FinanceHttpFixture,
  paymentId: string,
): Promise<void> {
  const search = await get(context, 'search?q=HTTP-POST&types=PAYMENT&limit=10');
  assert.equal(search.status, 200, await search.clone().text());
  assert.equal(
    (
      (await search.json()) as {
        items: Array<{
          id: string;
        }>;
      }
    ).items.some(({ id }) => id === paymentId),
    true,
  );
  const recent = await post(context, 'search/recent', {
    entityType: 'PAYMENT',
    entityId: paymentId,
  });
  assert.equal(recent.status, 204, await recent.clone().text());
  const hiddenRecent = await post(context, 'search/recent', {
    entityType: 'PAYMENT',
    entityId: fixture.foreignPaymentId,
  });
  assert.equal(hiddenRecent.status, 404);
  const recentSearch = await get(context, 'search');
  assert.equal(recentSearch.status, 200);
  assert.equal(
    (
      (await recentSearch.json()) as {
        recent: Array<{
          id: string;
        }>;
      }
    ).recent.some(({ id }) => id === paymentId),
    true,
  );
  const notifications = await get(context, 'notifications?limit=10');
  assert.equal(notifications.status, 200);
  const notificationBody = (await notifications.json()) as {
    unreadCount: number;
    items: Array<{
      id: string;
    }>;
  };
  assert.equal(notificationBody.unreadCount, 1);
  const firstNotificationId = notificationBody.items[0]!.id;
  const marked = await post(context, `notifications/${firstNotificationId}/read`);
  assert.equal(marked.status, 204, await marked.clone().text());
  assert.equal(
    await context.prisma.userNotification.count({ where: { id: firstNotificationId } }),
    0,
  );
  const afterRead = await get(context, 'notifications?limit=10');
  assert.equal(afterRead.status, 200, await afterRead.clone().text());
  const afterReadBody = (await afterRead.json()) as {
    items: Array<{ id: string }>;
    unreadCount: number;
  };
  assert.equal(afterReadBody.unreadCount, 0);
  assert.deepEqual(afterReadBody.items, []);
  await context.prisma.userNotification.create({
    data: {
      organizationId: context.organizationId,
      userId: context.userId,
      eventKey: `finance-http-second-${randomUUID()}`,
      type: 'REPORT_READY',
      payload: {},
    },
  });
  const all = await post(context, 'notifications/read-all');
  assert.equal(all.status, 204, await all.clone().text());
  assert.equal(
    await context.prisma.userNotification.count({
      where: { organizationId: context.organizationId, userId: context.userId },
    }),
    0,
  );
}
function dateOffset(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}
