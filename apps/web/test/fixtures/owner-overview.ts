import type { ResponseDashboardControllerOverviewResponse } from '@/api/generated/models/responseDashboardControllerOverviewResponse';

export const mockOverview: ResponseDashboardControllerOverviewResponse = {
  generatedAt: '2026-09-08T00:00:00.000Z',
  timezone: 'Africa/Cairo',
  range: {
    from: '2026-09-01T00:00:00.000Z',
    fromMonth: '2026-09',
    timeZone: 'Africa/Cairo',
    toExclusive: '2026-10-01T00:00:00.000Z',
    toMonth: '2026-10',
  },
  selectedBranchId: null,
  branches: [],
  kpis: {
    activeCohorts: 8,
    activeStudents: 540,
    attendanceRate: '92.5',
    currencyCode: 'EGP',
    netCollectionsInPeriod: '850000',
    netCollectionsThisMonth: '850000',
    outstandingBalance: '120000',
  },
  trends: {
    attendanceHealth: {
      belowMinimum: 7,
      healthy: 85,
      nearThreshold: 12,
      noData: 1,
    },
    collections: [
      { period: '2026-01', value: 720000 },
      { period: '2026-02', value: 850000 },
    ],
    enrollments: [
      { period: '2026-01', value: 48 },
      { period: '2026-02', value: 62 },
    ],
  },
  financeHealth: {
    aging: {
      current: '120000',
      days1To30: '35000',
      days31To60: '15000',
      days61To90: '8000',
      days91Plus: '4000',
    },
    dueNext30Days: '45000',
    overdueBalance: '62000',
    overdueEnrollmentCount: 12,
  },
  salesPipeline: {
    byState: {
      DISQUALIFIED: 4,
      LOST: 8,
      NEW: 45,
      OPEN: 30,
      QUALIFIED: 22,
      WON: 18,
    },
    convertedLeadsThisMonth: 18,
    newLeadsThisMonth: 50,
    openLeads: 75,
    overdueFollowUps: 6,
  },
  attention: {
    bySeverity: {},
    items: [],
    total: 0,
  },
  todaySessions: [],
  approvals: [],
  recentActivity: [],
  academyHealth: {
    failedOperations: 2,
    openImportIssues: 1,
    pendingApprovals: 5,
    pendingCertificateUploads: 0,
  },
};
