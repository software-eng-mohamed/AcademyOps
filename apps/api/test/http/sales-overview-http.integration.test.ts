import { describe, expect, it } from 'vitest';
import type { SalesOverview } from '../../src/crm/sales-dashboard/sales-dashboard.types';
import { get } from './finance-http-client';
import { runHttpScenario } from './http-test-harness';

const databaseDescribe =
  process.env.DATABASE_URL && process.env.REDIS_URL ? describe : describe.skip;

databaseDescribe('Sales overview HTTP with real sessions and rollback data', () => {
  it('enforces assignment scope over repeated real HTTP reads and ignores forged scope query params', async () => {
    await runHttpScenario({ permissions: ['leads.read'], roleCode: 'SALES' }, async (context) => {
      await context.prisma.rolePermissionGrant.updateMany({
        where: { organizationId: context.organizationId, permissionCode: 'leads.read' },
        data: { scope: 'A' },
      });
      const own = await context.prisma.lead.create({
        data: {
          organizationId: context.organizationId,
          branchId: context.branchId,
          assignedUserId: context.userId,
          personId: context.personId,
          nextActionAt: new Date(),
        },
      });
      await context.prisma.lead.create({
        data: {
          organizationId: context.organizationId,
          branchId: context.branchId,
          nextActionAt: new Date(),
        },
      });
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await get(context, 'dashboard/sales');
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toContain('no-store');
        const body = (await response.json()) as SalesOverview;
        expect(body.scope).toBe('ASSIGNED');
        expect(body.metrics.openLeads).toBe(1);
        expect(body.followUps.items.map((item: { id: string }) => item.id)).toEqual([own.id]);
        expect(body).not.toHaveProperty('financeHealth');
      }
      const forged = await get(
        context,
        `dashboard/sales?scope=O&assignedUserId=someone-else&branchId=${context.branchId}`,
      );
      expect(forged.status).toBe(200);
      expect(((await forged.json()) as SalesOverview).metrics.openLeads).toBe(1);
      const anonymous = await fetch(`${context.baseUrl}/api/v1/dashboard/sales`);
      expect(anonymous.status).toBe(401);
    });
  }, 120_000);

  it('denies an authenticated account without leads.read', async () => {
    await runHttpScenario({ permissions: [], roleCode: 'NO_GRANT' }, async (context) => {
      const response = await get(context, 'dashboard/sales');
      expect(response.status).toBe(403);
      expect(((await response.json()) as { code: string }).code).toBe('PERMISSION_DENIED');
    });
  }, 120_000);
});
