import type {
  WorkspaceMetricKey,
  WorkspaceOverview,
  WorkspaceOverviewRole,
} from '@academyops/api-client/workspace-overview';

const keys: Record<Exclude<WorkspaceOverviewRole, 'OTP_OPERATOR'>, WorkspaceMetricKey[]> = {
  OPERATIONS: ['sessionsToday', 'activeEnrollments', 'pendingEnrollments'],
  ACADEMIC: ['activeCohorts', 'sessionsToday', 'sessionsNext7Days'],
  RECEPTION: ['sessionsToday', 'draftEnrollments', 'pendingEnrollments'],
  ACCOUNTS: ['paymentsToday', 'paymentsThisMonth', 'reversedPaymentsThisMonth'],
  ATTENDANCE: ['sessionsToday', 'openWindowsToday', 'completedSessionsToday'],
  TRAINER: ['sessionsToday', 'sessionsNext7Days', 'completedSessionsThisMonth'],
  STUDENT: ['activeEnrollments', 'sessionsNext7Days', 'completedEnrollments'],
};
export function workspaceFixture(role: WorkspaceOverviewRole = 'OPERATIONS'): WorkspaceOverview {
  return {
    role,
    generatedAt: new Date().toISOString(),
    timezone: 'Africa/Cairo',
    metrics:
      role === 'OTP_OPERATOR' ? [] : keys[role].map((key, index) => ({ key, value: index + 1 })),
    queue:
      role === 'OTP_OPERATOR'
        ? null
        : {
            kind:
              role === 'ACCOUNTS'
                ? 'PAYMENTS'
                : ['TRAINER', 'STUDENT', 'ACADEMIC'].includes(role)
                  ? 'UPCOMING'
                  : 'TODAY',
            total: 8,
            items: [
              {
                id: 'session-a',
                title: 'Group A',
                subtitle: 'Room 2',
                at: '2026-09-02T10:00:00Z',
                status: role === 'ACCOUNTS' ? 'POSTED' : 'SCHEDULED',
                amount: role === 'ACCOUNTS' ? '125.50' : null,
              },
            ],
          },
    channel:
      role !== 'OTP_OPERATOR'
        ? null
        : {
            state: 'CONNECTED',
            enabled: true,
            otpAvailable: true,
            needsQr: false,
            phoneMasked: '+20****1234',
            lastConnectedAt: null,
            lastHeartbeatAt: null,
          },
  };
}
