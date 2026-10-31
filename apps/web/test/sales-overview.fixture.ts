import type { ResponseSalesDashboardControllerOverviewResponse } from '@/api/generated/models/responseSalesDashboardControllerOverviewResponse';

export function salesOverviewFixture(): ResponseSalesDashboardControllerOverviewResponse {
  return {
    generatedAt: new Date().toISOString(),
    timezone: 'Africa/Cairo',
    scope: 'ASSIGNED',
    period: {
      monthStart: '2026-08-31T21:00:00Z',
      todayStart: '2026-09-01T21:00:00Z',
      tomorrowStart: '2026-09-02T21:00:00Z',
    },
    metrics: {
      openLeads: 9,
      newLeadsThisMonth: 3,
      convertedLeadsThisMonth: 2,
      followUpsToday: 1,
      overdueFollowUps: 1,
    },
    followUps: {
      total: 2,
      items: [
        {
          id: 'lead-a',
          name: 'Amira',
          stageName: 'Qualified',
          nextActionAt: '2026-09-02T07:00:00Z',
          status: 'OVERDUE',
        },
        {
          id: 'lead-b',
          name: null,
          stageName: null,
          nextActionAt: '2026-09-02T12:00:00Z',
          status: 'TODAY',
        },
      ],
    },
  };
}
