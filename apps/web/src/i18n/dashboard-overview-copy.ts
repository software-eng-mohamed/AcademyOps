import type { Locale } from '@/lib/locales';
import { ar } from './dashboard-overview-copy.ar';
import { en } from './dashboard-overview-copy.en';

export type DashboardOverviewCopy = {
  academyHealth: {
    description: string;
    failedOperations: string;
    importIssues: string;
    pendingApprovals: string;
    pendingCertificates: string;
    title: string;
  };
  activity: {
    actions: Record<string, string>;
    columns: { action: string; actor: string; entity: string; updated: string };
    description: string;
    empty: string;
    entities: Record<string, string>;
    systemActor: string;
    title: string;
  };
  approvals: {
    empty: string;
    title: string;
    types: Record<string, string>;
  };
  attendance: {
    belowMinimum: string;
    enrollments: string;
    healthy: string;
    nearThreshold: string;
    noData: string;
    title: string;
  };
  attention: {
    columns: { issue: string; record: string; severity: string; updated: string };
    description: string;
    empty: string;
    reasons: Record<string, string>;
    title: string;
    total: string;
  };
  breadcrumb: { ariaLabel: string; dashboard: string; overview: string };
  charts: {
    activityDescription: string;
    activityTitle: string;
    approvalsDescription: string;
    approvalsTitle: string;
    attendanceDescription: string;
    attendanceTitle: string;
    collectionsDescription: string;
    collectionsTitle: string;
    currentMonth: string;
    enrollmentsDescription: string;
    enrollmentsTitle: string;
    lastSixMonths: string;
    newEnrollments: string;
    ownerActionsDescription: string;
    ownerActionsTitle: string;
    operationsDescription: string;
    operationsTitle: string;
    previousMonth: string;
    priorityDescription: string;
    priorityTitle: string;
    receivablesAgingDescription: string;
    receivablesAgingTitle: string;
    salesPipelineDescription: string;
    salesPipelineTitle: string;
  };
  finance: {
    agingCurrent: string;
    agingDays1To30: string;
    agingDays31To60: string;
    agingDays61To90: string;
    agingDays91Plus: string;
    dueNext30Days: string;
  };
  kpis: {
    activeCohorts: string;
    activeStudents: string;
    attendanceRate: string;
    branches: string;
    collectionsThisMonth: string;
    convertedLeads: string;
    netCollections: string;
    outstandingBalance: string;
    overdueReceivables: string;
  };
  notifications: {
    allRead: string;
    ariaLabel: string;
    emptyDescription: string;
    emptyTitle: string;
    error: string;
    fallback: string;
    loading: string;
    markAllRead: string;
    markAllSuccessDescription: string;
    markAllSuccessTitle: string;
    newCount: string;
    retry: string;
    title: string;
    types: Record<string, string>;
    unread: string;
    unreadIndicator: string;
    updateErrorDescription: string;
    updateErrorTitle: string;
    viewAll: string;
  };
  pageTitle: string;
  sessions: {
    attendanceProgress: string;
    description: string;
    detailsUnavailable: string;
    empty: string;
    eyebrow: string;
    statuses: Record<string, string>;
    title: string;
    unknownSession: string;
    unknownTime: string;
  };
  severity: Record<'CRITICAL' | 'INFO' | 'WARNING', string>;
  sales: {
    overdueFollowUps: string;
    states: Record<'DISQUALIFIED' | 'LOST' | 'NEW' | 'OPEN' | 'QUALIFIED' | 'WON', string>;
  };
  summary: {
    academyPulse: string;
    academyPulseDescription: string;
    acrossBranches: string;
    awaitingDecision: string;
    collections: string;
    currentPeriod: string;
    currentTotal: string;
    enrollmentTrend: string;
    leadsStatus: string;
    needsAttention: string;
    noComparison: string;
    onTrack: string;
    overdueAccounts: string;
    requiresReview: string;
    studentsAtRisk: string;
    title: string;
    todayInCairo: string;
    versusPreviousMonth: string;
  };
  unavailable: { description: string; title: string };
  welcome: string;
  welcomeDescription: string;
};

export function getDashboardOverviewCopy(locale: Locale): DashboardOverviewCopy {
  return locale === 'ar' ? ar : en;
}
