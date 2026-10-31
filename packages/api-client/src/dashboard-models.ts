export type DashboardPeriodQuery = {
  branchId?: string;
  fromMonth?: string;
  toMonth?: string;
};

export type DashboardRangeMeta = {
  from: string;
  toExclusive: string;
  fromMonth: string;
  toMonth: string;
  timeZone: 'Africa/Cairo';
};

export type DashboardOverview = {
  generatedAt: string;
  timezone: 'Africa/Cairo';
  range: DashboardRangeMeta;
  selectedBranchId: string | null;
  branches: Array<{
    id: string;
    code: string;
    name: string;
  }>;
  kpis: {
    activeStudents: number;
    netCollectionsInPeriod: string;
    netCollectionsThisMonth: string;
    outstandingBalance: string;
    attendanceRate: string | null;
    activeCohorts: number;
    currencyCode: 'EGP';
  };
  trends: {
    enrollments: Array<{
      period: string;
      value: number;
    }>;
    collections: Array<{
      period: string;
      value: number;
    }>;
    attendanceHealth: {
      healthy: number;
      nearThreshold: number;
      belowMinimum: number;
      noData: number;
    };
  };
  financeHealth: {
    overdueBalance: string;
    overdueEnrollmentCount: number;
    dueNext30Days: string;
    aging: {
      current: string;
      days1To30: string;
      days31To60: string;
      days61To90: string;
      days91Plus: string;
    };
  };
  salesPipeline: {
    byState: Record<string, number>;
    convertedLeadsThisMonth: number;
    newLeadsThisMonth: number;
    openLeads: number;
    overdueFollowUps: number;
  };
  attention: {
    total: number;
    bySeverity: Record<string, number>;
    items: Array<{
      id: string;
      reasonCode: string;
      severity: 'INFO' | 'WARNING' | 'CRITICAL';
      entityType: string;
      entityId: string;
      context: Record<string, string | number>;
      occurredAt: string;
    }>;
  };
  todaySessions: Array<{
    id: string;
    startsAt: string | null;
    endsAt: string | null;
    program: { name: string } | null;
    cohort: { code: string; name: string | null } | null;
    trainer: { name: string | null } | null;
    room: { name: string } | null;
    deliveryMode: string;
    status: string;
    attendanceWindowState: string;
    attendance: {
      expected: number;
      checkedIn: number;
    };
  }>;
  approvals: Array<{
    id: string;
    type: string;
    entityType: string;
    entityId: string;
    amount?: string;
    currencyCode?: string;
    submittedAt: string;
    version?: number;
  }>;
  recentActivity: Array<{
    id: string;
    actionCode: string;
    entityType: string;
    entityId: string | null;
    actor: { name: string | null } | null;
    createdAt: string;
  }>;
  academyHealth: {
    openImportIssues: number;
    failedOperations: number;
    pendingCertificateUploads: number;
    pendingApprovals: number;
  };
};
