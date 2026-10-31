import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/platform/database/prisma.service';
import { DashboardMetricsService } from '../src/reporting/dashboard-metrics.service';
import { DashboardScopeService } from '../src/reporting/dashboard-scope.service';
describe('DashboardScopeService', () => {
  it.each(['A', 'S'] as const)(
    'does not treat %s grants as branch membership authority',
    async (scope) => {
      const findFirst = vi.fn();
      const service = new DashboardScopeService({
        branch: { findFirst },
      } as unknown as PrismaService);
      const access: AccessContext = {
        organizationId: 'org-1',
        actorUserId: 'user-1',
        branchIds: new Set(['b-1']),
        assignedResourceIds: new Set(),
        grants: new Map([['reports.operations.read', new Set([scope])]]),
      };
      await expect(service.visibleBranchIds(access)).rejects.toThrow(ForbiddenException);
      await expect(service.visibleBranchIds(access, 'b-1')).rejects.toThrow(ForbiddenException);
      expect(findFirst).not.toHaveBeenCalled();
    },
  );
  it('returns null for organization-wide access when no branch requested', async () => {
    const prisma = { branch: { findFirst: vi.fn() } } as unknown as PrismaService;
    const scopeService = new DashboardScopeService(prisma);
    const access = {
      organizationId: 'org-1',
      actorUserId: 'user-1',
      branchIds: new Set(['b-1']),
      grants: new Map([['reports.operations.read', new Set(['O'])]]),
    } as AccessContext;
    const result = await scopeService.visibleBranchIds(access);
    expect(result).toBeNull();
  });
  it('returns user branches for branch-restricted access', async () => {
    const prisma = { branch: { findFirst: vi.fn() } } as unknown as PrismaService;
    const scopeService = new DashboardScopeService(prisma);
    const access = {
      organizationId: 'org-1',
      actorUserId: 'user-1',
      branchIds: new Set(['b-1', 'b-2']),
      grants: new Map([['reports.operations.read', new Set(['B'])]]),
    } as AccessContext;
    const result = await scopeService.visibleBranchIds(access);
    expect(result).toEqual(['b-1', 'b-2']);
  });
  it('throws NotFoundException for invalid or forbidden requested branch', async () => {
    const prisma = {
      branch: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const scopeService = new DashboardScopeService(prisma);
    const access = {
      organizationId: 'org-1',
      actorUserId: 'user-1',
      branchIds: new Set(['b-1']),
      grants: new Map([['reports.operations.read', new Set(['B'])]]),
    } as AccessContext;
    await expect(scopeService.visibleBranchIds(access, 'invalid-b')).rejects.toThrow(
      NotFoundException,
    );
  });
});
describe('DashboardMetricsService', () => {
  const metricsService = new DashboardMetricsService();
  it('computes outstanding balance correctly from debits and allocations', () => {
    const debitEntries = [
      { id: 'd-1', amount: new Prisma.Decimal('100.00') },
      { id: 'd-2', amount: new Prisma.Decimal('200.00') },
    ];
    const allocations = [{ debitEntryId: 'd-1', _sum: { amount: new Prisma.Decimal('40.00') } }];
    const { outstanding, allocatedByDebit } = metricsService.computeOutstanding(
      debitEntries,
      allocations,
    );
    expect(outstanding.toFixed(2)).toBe('260.00');
    expect(allocatedByDebit.get('d-1')?.toFixed(2)).toBe('40.00');
  });
  it('calculates net collections accounting for gross, refunds, and reversals', () => {
    const from = new Date('2026-08-01T00:00:00Z');
    const to = new Date('2026-08-31T23:59:59Z');
    const payments = [
      { id: 'p-1', amount: new Prisma.Decimal('1000.00'), receivedAt: new Date('2026-08-10') },
      { id: 'p-2', amount: new Prisma.Decimal('500.00'), receivedAt: new Date('2026-08-15') },
    ];
    const visibleRefunds = [
      {
        paymentId: 'p-1',
        amount: new Prisma.Decimal('100.00'),
        processedAt: new Date('2026-08-12'),
      },
    ];
    const visibleReversals = [{ paymentId: 'p-2', occurredAt: new Date('2026-08-16') }];
    const paymentById = new Map(payments.map((p) => [p.id, p]));
    const net = metricsService.collectionsFor(
      payments,
      visibleRefunds,
      visibleReversals,
      paymentById,
      from,
      to,
    );
    expect(net.toFixed(2)).toBe('900.00');
  });
});
