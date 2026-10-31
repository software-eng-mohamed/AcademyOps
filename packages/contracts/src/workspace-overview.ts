import type { AccessScope, PermissionCode } from './permissions.js';
import type { StaffOverview } from './staff-overview.js';

export const workspaceOverviewRoles = [
  'OPERATIONS',
  'ACADEMIC',
  'RECEPTION',
  'ACCOUNTS',
  'ATTENDANCE',
  'TRAINER',
  'STUDENT',
  'OTP_OPERATOR',
] as const;
export type WorkspaceOverviewRole = (typeof workspaceOverviewRoles)[number];
type Requirement = readonly [PermissionCode, readonly AccessScope[]];
const catalog: Requirement = ['academic.catalog.read', ['O', 'B']];
const enrollments: Requirement = ['enrollments.read', ['O', 'B']];

// Shared by routing and the API. A role label alone never grants data access.
export const workspaceOverviewRequirements: Record<WorkspaceOverviewRole, readonly Requirement[]> =
  {
    OPERATIONS: [catalog, enrollments],
    ACADEMIC: [catalog],
    RECEPTION: [catalog, enrollments],
    ACCOUNTS: [['payments.read', ['O', 'B']]],
    ATTENDANCE: [catalog, ['attendance.read', ['O', 'B']]],
    TRAINER: [['academic.catalog.read', ['A']]],
    STUDENT: [
      ['academic.catalog.read', ['S']],
      ['enrollments.read', ['S']],
    ],
    OTP_OPERATOR: [['messaging.otp.read', ['O']]],
  };

export type WorkspaceMetricKey =
  | 'sessionsToday'
  | 'sessionsNext7Days'
  | 'completedSessionsThisMonth'
  | 'activeEnrollments'
  | 'pendingEnrollments'
  | 'draftEnrollments'
  | 'completedEnrollments'
  | 'activeCohorts'
  | 'openWindowsToday'
  | 'completedSessionsToday'
  | 'paymentsToday'
  | 'paymentsThisMonth'
  | 'reversedPaymentsThisMonth';

export type WorkspaceOverview = {
  student?: StudentOverview;
  staff?: StaffOverview;
  role: WorkspaceOverviewRole;
  generatedAt: string;
  timezone: 'Africa/Cairo';
  metrics: Array<{ key: WorkspaceMetricKey; value: number }>;
  queue: {
    kind: 'TODAY' | 'UPCOMING' | 'PAYMENTS';
    total: number;
    items: Array<{
      id: string;
      title: string | null;
      subtitle: string | null;
      at: string;
      status: string;
      amount: string | null;
    }>;
  } | null;
  channel: {
    state:
      | 'DISABLED'
      | 'STARTING'
      | 'QR_REQUIRED'
      | 'CONNECTED'
      | 'DISCONNECTED'
      | 'FAULTED'
      | 'STALE';
    enabled: boolean;
    otpAvailable: boolean;
    needsQr: boolean;
    phoneMasked: string | null;
    lastConnectedAt: string | null;
    lastHeartbeatAt: string | null;
  } | null;
};

export type StudentSession = {
  id: string;
  title: string | null;
  cohort: string | null;
  room: string | null;
  startsAt: string;
  endsAt: string | null;
  deliveryMode: string;
  status: string;
};

export type StudentOverview = {
  nextSession: StudentSession | null;
  schedule: { from: string; to: string; total: number; items: StudentSession[] };
  courses: { total: number; items: Array<{ id: string; name: string | null; state: string }> };
  attendance: {
    numerator: number;
    denominator: number;
    ratio: number | null;
    present: number;
    late: number;
    absent: number;
    excused: number;
    unmarked: number;
  } | null;
  finance: {
    currency: 'EGP';
    totalDebits: string;
    totalCredits: string;
    balance: string;
    installments: {
      total: number;
      overdueAmount: string;
      items: Array<{
        id: string;
        ordinal: number;
        course: string | null;
        dueDate: string;
        amount: string;
        remaining: string;
        state: 'OVERDUE' | 'DUE' | 'UPCOMING';
      }>;
    };
  } | null;
  payments: { months: Array<{ month: string; amount: string }>; total: string } | null;
};
