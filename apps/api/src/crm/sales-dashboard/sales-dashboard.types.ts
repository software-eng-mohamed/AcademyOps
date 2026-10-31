export type SalesFollowUp = {
  id: string;
  name: string | null;
  stageName: string | null;
  nextActionAt: string;
  status: 'OVERDUE' | 'TODAY';
};

export type SalesOverview = {
  insights?: {
    states: Array<{ key: string; value: number }>;
    days: Array<{ date: string; count: number }>;
    sources: Array<{ source: string | null; count: number }>;
    withoutNextAction: number;
  };
  generatedAt: string;
  timezone: 'Africa/Cairo';
  scope: 'ASSIGNED' | 'ACCESSIBLE';
  period: { monthStart: string; todayStart: string; tomorrowStart: string };
  metrics: {
    openLeads: number;
    newLeadsThisMonth: number;
    convertedLeadsThisMonth: number;
    followUpsToday: number;
    overdueFollowUps: number;
  };
  followUps: { total: number; items: SalesFollowUp[] };
};
