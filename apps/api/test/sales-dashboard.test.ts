import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AccessContext, AccessScope } from '@academyops/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LeadAccessService } from '../src/crm/leads/lead-access.service';
import { SalesDashboardService } from '../src/crm/sales-dashboard/sales-dashboard.service';
import type { PrismaService } from '../src/platform/database/prisma.service';

function access(scopes: AccessScope[] = ['A']): AccessContext {
  return {
    organizationId: 'org-1',
    actorUserId: 'sales-1',
    branchIds: new Set(['branch-1']),
    assignedResourceIds: new Set(['lead-1']),
    grants: new Map([['leads.read', new Set(scopes)]]),
  };
}

function setup() {
  const row = {
    openLeads: 9,
    newLeadsThisMonth: 3,
    convertedLeadsThisMonth: 2,
    followUpsToday: 2,
    overdueFollowUps: 4,
    dueFollowUps: 5,
    states: [{ key: 'OPEN', value: 9 }],
    days: [],
    sources: [],
    withoutNextAction: 1,
    items: [
      { id: 'due', name: 'Due lead', stageName: null, nextActionAt: '2026-09-02T08:00:00Z' },
      { id: 'next', name: null, stageName: 'Qualified', nextActionAt: '2026-09-02T12:00:00Z' },
    ],
  };
  const query = vi.fn().mockResolvedValue([row]);
  const prisma = { $queryRaw: query } as unknown as PrismaService;
  return { query, service: new SalesDashboardService(prisma, new LeadAccessService(prisma)) };
}

afterEach(() => vi.useRealTimers());

describe('sales overview', () => {
  it('returns a compact, single-query snapshot with canonical due dates', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-02T09:00:00Z'));
    const { service, query } = setup();
    const result = await service.overview(access());
    expect(query).toHaveBeenCalledTimes(1);
    expect(result.scope).toBe('ASSIGNED');
    expect(result.period).toEqual({
      monthStart: '2026-08-31T21:00:00.000Z',
      todayStart: '2026-09-01T21:00:00.000Z',
      tomorrowStart: '2026-09-02T21:00:00.000Z',
    });
    expect(result.metrics.openLeads).toBe(9);
    expect(result.followUps.total).toBe(5);
    expect(result.followUps.items.map(({ status }) => status)).toEqual(['OVERDUE', 'TODAY']);
    expect(result.followUps.items[1]?.name).toBeNull();
    expect(result).not.toHaveProperty('financeHealth');
    expect(result).not.toHaveProperty('recentActivity');
    const sql = query.mock.calls[0]![0] as Prisma.Sql;
    expect(sql.values).toEqual(expect.arrayContaining(['org-1', 'sales-1', ['lead-1']]));
    expect(sql.sql).not.toContain('sales-1');
  });

  it.each(([[], ['S']] as AccessScope[][]).map((scopes) => ({ scopes })))(
    'rejects unsupported lead scopes $scopes before querying',
    async ({ scopes }) => {
      const { service, query } = setup();
      await expect(service.overview(access(scopes))).rejects.toThrow(ForbiddenException);
      expect(query).not.toHaveBeenCalled();
    },
  );

  it('does not treat operational reporting access as lead access', async () => {
    const { service, query } = setup();
    const user = access();
    user.grants = new Map([['reports.operations.read', new Set(['B'])]]);
    await expect(service.overview(user)).rejects.toThrow(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
  });

  it.each(([['B'], ['O'], ['B', 'A']] as AccessScope[][]).map((scopes) => ({ scopes })))(
    'labels broad granted scopes accurately: $scopes',
    async ({ scopes }) => {
      const { service } = setup();
      expect((await service.overview(access(scopes))).scope).toBe('ACCESSIBLE');
    },
  );

  it('propagates a database failure instead of reporting false zeroes', async () => {
    const { service, query } = setup();
    query.mockRejectedValueOnce(new Error('Database unavailable'));
    await expect(service.overview(access())).rejects.toThrow('Database unavailable');
  });

  it.each([
    ['2026-01-31T22:30:00Z', '2026-01-31T22:00:00.000Z'],
    ['2026-08-31T21:30:00Z', '2026-08-31T21:00:00.000Z'],
  ])('uses the Cairo month boundary at %s', async (now, monthStart) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(now));
    const { service } = setup();
    expect((await service.overview(access())).period.monthStart).toBe(monthStart);
  });
});
