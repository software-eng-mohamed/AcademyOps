import type { AccessContext } from '@academyops/contracts';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/platform/database/prisma.service';
import { DashboardActivityService } from '../src/reporting/dashboard-activity.service';
import { DashboardApprovalsService } from '../src/reporting/dashboard-approvals.service';
import { DashboardAttentionService } from '../src/reporting/dashboard-attention.service';
import { DashboardBalanceService } from '../src/reporting/dashboard-balance.service';
import { DashboardCommercialService } from '../src/reporting/dashboard-commercial.service';
import { DashboardDataService } from '../src/reporting/dashboard-data.service';
import { DashboardMetricsService } from '../src/reporting/dashboard-metrics.service';
import { DashboardScopeService } from '../src/reporting/dashboard-scope.service';
import { DashboardService } from '../src/reporting/dashboard.service';
describe('Dashboard decomposition & collaborators', () => {
  describe('Dashboard financial and commercial health', () => {
    it('returns owner-facing receivables aging from the accounting schedule', async () => {
      const row = {
        agingCurrent: new Prisma.Decimal('3000.00'),
        agingDays1To30: new Prisma.Decimal('700.00'),
        agingDays31To60: new Prisma.Decimal('200.00'),
        agingDays61To90: new Prisma.Decimal('75.00'),
        agingDays91Plus: new Prisma.Decimal('25.00'),
        dueNext30Days: new Prisma.Decimal('1200.00'),
        outstandingBalance: new Prisma.Decimal('4000.00'),
        overdueBalance: new Prisma.Decimal('1000.00'),
        overdueEnrollmentCount: 3,
      };
      const prisma = { $queryRaw: vi.fn().mockResolvedValue([row]) } as unknown as PrismaService;
      const result = await new DashboardBalanceService(prisma).financialHealth(
        'org-1',
        null,
        '2026-09-02',
      );
      expect(result.overdueBalance.toFixed(2)).toBe('1000.00');
      expect(result.overdueEnrollmentCount).toBe(3);
      expect(result.dueNext30Days.toFixed(2)).toBe('1200.00');
    });

    it('summarizes active sales pipeline, conversions, and overdue follow-ups', async () => {
      const prisma = {
        lead: {
          groupBy: vi.fn().mockResolvedValue([
            { state: 'NEW', _count: { _all: 4 } },
            { state: 'OPEN', _count: { _all: 3 } },
            { state: 'QUALIFIED', _count: { _all: 2 } },
            { state: 'WON', _count: { _all: 5 } },
          ]),
          count: vi.fn().mockResolvedValueOnce(6).mockResolvedValueOnce(2),
        },
        $queryRaw: vi.fn().mockResolvedValue([{ count: 5 }]),
      } as unknown as PrismaService;
      const result = await new DashboardCommercialService(prisma).pipeline(
        'org-1',
        null,
        new Date('2026-09-01T00:00:00Z'),
        new Date('2026-09-03T00:00:00Z'),
        new Date('2026-09-02T12:00:00Z'),
      );
      expect(result.openLeads).toBe(9);
      expect(result.newLeadsThisMonth).toBe(6);
      expect(result.convertedLeadsThisMonth).toBe(5);
      expect(result.overdueFollowUps).toBe(2);
      expect(result.byState.QUALIFIED).toBe(2);
    });
  });
  describe('DashboardAttentionService & DashboardApprovalsService & DashboardActivityService', () => {
    it('sorts attention items by severity CRITICAL < WARNING < INFO', async () => {
      const prisma = {
        installment: { findMany: vi.fn().mockResolvedValue([]) },
        eligibilityEvaluation: { findMany: vi.fn().mockResolvedValue([]) },
        certificate: { findMany: vi.fn().mockResolvedValue([]) },
        importIssue: { findMany: vi.fn().mockResolvedValue([]) },
        outboxEvent: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'ev-1',
              aggregateType: 'Enrollment',
              aggregateId: 'e-1',
              type: 'FAILED',
              createdAt: new Date(),
            },
          ]),
        },
        reportExportJob: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'j-1',
              reportType: 'ACADEMIC',
              createdAt: new Date(),
            },
          ]),
        },
        ledgerEntry: { findMany: vi.fn().mockResolvedValue([]) },
        ledgerAllocation: { groupBy: vi.fn().mockResolvedValue([]) },
      } as unknown as PrismaService;
      const attentionService = new DashboardAttentionService(prisma);
      const access = {
        organizationId: 'org-1',
        actorUserId: 'user-1',
        branchIds: new Set(['b-1']),
        grants: new Map(),
      } as AccessContext;
      const items = await attentionService.getAttentionItems(access, [], [], new Map(), new Date());
      expect(items.length).toBe(2);
      expect(items[0].severity).toBe('CRITICAL');
      expect(items[1].severity).toBe('WARNING');
    });
    it('retrieves and formats pending approvals sorted by submittedAt', async () => {
      const queryRaw = vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'c-1',
            enrollmentId: 'e-1',
            createdAt: new Date('2026-08-01T10:00:00Z'),
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'r-1',
            paymentId: 'p-1',
            requestedAmount: new Prisma.Decimal('50.00'),
            createdAt: new Date('2026-08-01T09:00:00Z'),
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      const prisma = {
        $queryRaw: queryRaw,
      } as unknown as PrismaService;
      const approvalsService = new DashboardApprovalsService(prisma);
      const access = {
        organizationId: 'org-1',
        actorUserId: 'user-1',
        branchIds: new Set(['b-1']),
        grants: new Map(),
      } as AccessContext;
      const approvals = await approvalsService.getApprovals(access, ['e-1'], ['p-1']);
      expect(approvals.length).toBe(2);
      expect(approvals[0].id).toBe('r-1');
      expect(approvals[1].id).toBe('c-1');
    });
    it('retrieves recent activity and maps audit events', async () => {
      const prisma = {
        auditEvent: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'audit-1',
              actorUserId: 'user-1',
              action: 'UPDATE',
              entityType: 'Enrollment',
              entityId: 'e-1',
              createdAt: new Date('2026-08-11T12:00:00Z'),
            },
          ]),
        },
        user: { findMany: vi.fn().mockResolvedValue([{ id: 'user-1', personId: 'p-1' }]) },
        person: {
          findMany: vi.fn().mockResolvedValue([{ id: 'p-1', name: 'Ali' }]),
        },
      } as unknown as PrismaService;
      const activityService = new DashboardActivityService(prisma);
      const activity = await activityService.getRecentActivity('org-1');
      expect(activity.length).toBe(1);
      expect(activity[0].actionCode).toBe('UPDATE');
      expect(activity[0].actor).toEqual({ name: 'Ali' });
    });
  });
  describe('DashboardService Facade Delegation', () => {
    it('delegates scope resolution and metric computation correctly', async () => {
      const prisma = {
        enrollment: { findMany: vi.fn().mockResolvedValue([]) },
        cohort: { findMany: vi.fn().mockResolvedValue([]) },
        branch: { findMany: vi.fn().mockResolvedValue([]) },
        payment: { findMany: vi.fn().mockResolvedValue([]) },
        ledgerEntry: { findMany: vi.fn().mockResolvedValue([]) },
        session: { findMany: vi.fn().mockResolvedValue([]) },
        refund: { findMany: vi.fn().mockResolvedValue([]) },
        paymentEvent: { findMany: vi.fn().mockResolvedValue([]) },
        ledgerAllocation: { groupBy: vi.fn().mockResolvedValue([]) },
        attendanceRecord: { findMany: vi.fn().mockResolvedValue([]) },
        makeupCredit: { findMany: vi.fn().mockResolvedValue([]) },
      } as unknown as PrismaService;
      const scopeService = new DashboardScopeService(prisma);
      const metricsService = new DashboardMetricsService();
      const attentionService = new DashboardAttentionService(prisma);
      const approvalsService = new DashboardApprovalsService(prisma);
      const activityService = new DashboardActivityService(prisma);
      const balanceService = new DashboardBalanceService(prisma);
      const commercialService = new DashboardCommercialService(prisma);
      const dataService = new DashboardDataService(prisma);
      const visibleBranchIdsSpy = vi
        .spyOn(scopeService, 'visibleBranchIds')
        .mockResolvedValue(null);
      const getAttentionItemsSpy = vi
        .spyOn(attentionService, 'getAttentionItems')
        .mockResolvedValue([]);
      vi.spyOn(approvalsService, 'getApprovals').mockResolvedValue([]);
      vi.spyOn(activityService, 'getTodaySessions').mockResolvedValue([]);
      vi.spyOn(activityService, 'getRecentActivity').mockResolvedValue([]);
      vi.spyOn(balanceService, 'financialHealth').mockResolvedValue({
        agingCurrent: new Prisma.Decimal(0),
        agingDays1To30: new Prisma.Decimal(0),
        agingDays31To60: new Prisma.Decimal(0),
        agingDays61To90: new Prisma.Decimal(0),
        agingDays91Plus: new Prisma.Decimal(0),
        dueNext30Days: new Prisma.Decimal(0),
        outstandingBalance: new Prisma.Decimal(0),
        overdueBalance: new Prisma.Decimal(0),
        overdueEnrollmentCount: 0,
      });
      vi.spyOn(commercialService, 'pipeline').mockResolvedValue({
        byState: {},
        convertedLeadsThisMonth: 0,
        newLeadsThisMonth: 0,
        openLeads: 0,
        overdueFollowUps: 0,
      });
      vi.spyOn(dataService, 'visiblePayments').mockResolvedValue([]);
      vi.spyOn(dataService, 'visibleSessions').mockResolvedValue([]);
      vi.spyOn(dataService, 'visibleRefunds').mockResolvedValue([]);
      vi.spyOn(dataService, 'visibleReversals').mockResolvedValue([]);
      vi.spyOn(dataService, 'makeupCredits').mockResolvedValue([]);
      const facade = new DashboardService(
        prisma,
        scopeService,
        metricsService,
        attentionService,
        approvalsService,
        activityService,
        balanceService,
        commercialService,
        dataService,
      );
      const access = {
        organizationId: 'org-1',
        actorUserId: 'user-1',
        branchIds: new Set(['b-1']),
        grants: new Map([['reports.operations.read', new Set(['O'])]]),
      } as AccessContext;
      const result = await facade.overview(access);
      expect(result.timezone).toBe('Africa/Cairo');
      expect(result.kpis.currencyCode).toBe('EGP');
      expect(visibleBranchIdsSpy).toHaveBeenCalledWith(access, undefined);
      expect(getAttentionItemsSpy).toHaveBeenCalled();
    });
  });
});
