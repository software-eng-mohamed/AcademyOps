import { Prisma } from '@prisma/client';
import type { AccessScope } from '@academyops/contracts';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LeadAccessService } from '../src/crm/leads/lead-access.service';
import { SalesDashboardService } from '../src/crm/sales-dashboard/sales-dashboard.service';
import type { PrismaService } from '../src/platform/database/prisma.service';
import { createTestHarness } from './postgres/harness';
import { SALES_NOW, salesFixture } from './postgres/sales-dashboard-fixture';

const { prisma, inRollbackTransaction, databaseDescribe } = createTestHarness();
const service = (tx: Prisma.TransactionClient) => {
  const db = tx as unknown as PrismaService;
  return new SalesDashboardService(db, new LeadAccessService(db));
};

databaseDescribe('Sales overview on PostgreSQL (rolled back)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(SALES_NOW);
  });
  afterEach(() => vi.useRealTimers());
  afterAll(() => prisma.$disconnect());

  it('isolates two salespeople in the same branch and excludes unassigned and foreign leads', async () => {
    await inRollbackTransaction(async (tx) => {
      const f = await salesFixture(tx);
      const own = await f.lead();
      const other = await f.lead({ assignedUserId: f.otherUser.id });
      await f.lead({ assignedUserId: null });
      await f.lead({
        organizationId: f.foreignOrg.id,
        branchId: f.foreignBranch.id,
        assignedUserId: null,
        personId: null,
        stageId: null,
      });
      const first = await service(tx).overview(f.access());
      const second = await service(tx).overview(f.access(['A'], f.otherUser.id));
      expect(first.metrics.openLeads).toBe(1);
      expect(first.insights?.states).toEqual([{ key: 'NEW', value: 1 }]);
      expect(first.insights?.days).toHaveLength(28);
      expect(first.insights?.days.reduce((sum, d) => sum + d.count, 0)).toBe(1);
      expect(second.metrics.openLeads).toBe(1);
      expect(first.followUps.items.map(({ id }) => id)).toEqual([own.id]);
      expect(second.followUps.items.map(({ id }) => id)).toEqual([other.id]);
      expect(first.followUps.items[0]).toMatchObject({
        name: 'Sales one',
        stageName: 'New enquiry',
      });
      await tx.lead.update({
        where: { id: own.id },
        data: { assignedUserId: f.otherUser.id, version: { increment: 1 } },
      });
      expect((await service(tx).overview(f.access())).metrics.openLeads).toBe(0);
      expect((await service(tx).overview(f.access(['A'], f.otherUser.id))).metrics.openLeads).toBe(
        2,
      );
    });
  });

  it('keeps aggregate SQL scope identical to existing ORM scope for every grant combination', async () => {
    await inRollbackTransaction(async (tx) => {
      const f = await salesFixture(tx);
      await f.lead();
      await f.lead({ assignedUserId: f.otherUser.id });
      const resource = await f.lead({ branchId: f.otherBranch.id, assignedUserId: null });
      await f.lead({
        organizationId: f.foreignOrg.id,
        branchId: f.foreignBranch.id,
        assignedUserId: null,
        personId: null,
        stageId: null,
      });
      const leadAccess = new LeadAccessService(tx as unknown as PrismaService);
      for (const scopes of [[], ['S'], ['A'], ['B'], ['O'], ['A', 'B']] as AccessScope[][]) {
        const access = f.access(scopes);
        access.assignedResourceIds = new Set([resource.id]);
        const orm = await tx.lead.findMany({
          where: { organizationId: f.org.id, ...leadAccess.scopeWhere(access, 'leads.read') },
          select: { id: true },
        });
        const sql = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT lead.id FROM leads AS lead WHERE lead.organization_id = ${f.org.id}::uuid AND ${leadAccess.scopeSql(access, 'leads.read')}`,
        );
        expect(sql.map(({ id }) => id).sort()).toEqual(orm.map(({ id }) => id).sort());
      }
      const assigned = f.access();
      assigned.assignedResourceIds = new Set([resource.id]);
      expect((await service(tx).overview(assigned)).metrics.openLeads).toBe(2);
      const emptyBranch = f.access(['B']);
      emptyBranch.branchIds = new Set();
      expect((await service(tx).overview(emptyBranch)).followUps).toEqual({ total: 0, items: [] });
      expect((await service(tx).overview(f.access(['O']))).metrics.openLeads).toBe(3);
    });
  });

  it('uses Cairo month/day boundaries, actual conversion dates and only open follow-ups', async () => {
    await inRollbackTransaction(async (tx) => {
      const f = await salesFixture(tx);
      await f.lead({
        createdAt: new Date('2026-08-31T20:59:59Z'),
        nextActionAt: new Date('2026-09-01T20:59:59Z'),
      });
      await f.lead({
        createdAt: new Date('2026-08-31T21:00:00Z'),
        nextActionAt: new Date('2026-09-01T21:00:00Z'),
      });
      await f.lead({ nextActionAt: new Date('2026-09-02T21:00:00Z') });
      await f.lead({ nextActionAt: null });
      await f.lead({ state: 'LOST' });
      await f.lead({ state: 'DISQUALIFIED' });
      const wonNow = await f.lead({ state: 'WON', createdAt: new Date('2026-07-01T00:00:00Z') });
      const wonBefore = await f.lead({ state: 'WON' });
      await f.convert(wonNow.id, new Date('2026-08-31T21:00:00Z'));
      await f.convert(wonBefore.id, new Date('2026-08-31T20:59:59Z'));
      const result = await service(tx).overview(f.access());
      expect(result.metrics).toEqual({
        openLeads: 4,
        newLeadsThisMonth: 6,
        convertedLeadsThisMonth: 1,
        followUpsToday: 1,
        overdueFollowUps: 2,
      });
      expect(result.followUps.total).toBe(2);
      expect(result.insights?.withoutNextAction).toBe(1);
      expect(result.insights?.states).toEqual(
        expect.arrayContaining([
          { key: 'WON', value: 2 },
          { key: 'DISQUALIFIED', value: 1 },
        ]),
      );
    });
  });

  it('limits the queue to six without truncating totals and uses stable date/id ordering', async () => {
    await inRollbackTransaction(async (tx) => {
      const f = await salesFixture(tx);
      const ids: string[] = [];
      for (let i = 0; i < 8; i++) ids.push((await f.lead({ personId: null, stageId: null })).id);
      const result = await service(tx).overview(f.access());
      expect(result.metrics.openLeads).toBe(8);
      expect(result.followUps.total).toBe(8);
      expect(result.followUps.items.map(({ id }) => id)).toEqual(ids.sort().slice(0, 6));
      expect(result.followUps.items[0]).toMatchObject({
        name: null,
        stageName: null,
        status: 'TODAY',
      });
    });
  });
});
