import type { StaffOverview } from '@academyops/api-client/workspace-overview';

export const staffFixtures: Record<StaffOverview['kind'], StaffOverview> = {
  OPERATIONS: {
    kind: 'OPERATIONS',
    days: [{ date: '2026-09-02', scheduled: 8, completed: 2 }],
    registrations: [
      { key: 'ACTIVE', value: 12 },
      { key: 'DRAFT', value: 4 },
    ],
    deliveryModes: [{ key: 'ONLINE', value: 10 }],
    preparation: { missingRoom: 0, missingTrainer: 2 },
  },
  ACADEMIC: {
    kind: 'ACADEMIC',
    sessionStates: [
      { key: 'SCHEDULED', value: 8 },
      { key: 'COMPLETED', value: 2 },
    ],
    cohorts: {
      total: 12,
      items: [
        {
          id: 'cohort-1',
          name: 'Group Alpha',
          status: 'ACTIVE',
          scheduled: 8,
          completed: 2,
          draft: 1,
          cancelled: 1,
        },
      ],
    },
  },
  RECEPTION: {
    kind: 'RECEPTION',
    days: [{ date: '2026-09-02', count: 5 }],
    states: [
      { key: 'DRAFT', value: 2 },
      { key: 'ACTIVE', value: 3 },
    ],
    recent: [
      { id: 'reg-1', course: 'English basics', state: 'DRAFT', createdAt: '2026-09-02T09:00:00Z' },
    ],
  },
  ACCOUNTS: {
    kind: 'ACCOUNTS',
    months: [{ month: '2026-09', amount: '40.55' }],
    monthPostedAmount: '40.55',
    methods: [{ name: 'Cash', amount: '40.55' }],
    pending: { count: 1, amount: '9.75' },
  },
  ATTENDANCE: {
    kind: 'ATTENDANCE',
    days: [{ date: '2026-09-02', present: 10, late: 2, absent: 1, excused: 1, unmarked: 0 }],
    recordsToday: [
      { key: 'PRESENT', value: 10 },
      { key: 'LATE', value: 2 },
      { key: 'EXCUSED', value: 1 },
    ],
    windows: [{ key: 'OPEN', value: 2 }],
  },
  TRAINER: {
    kind: 'TRAINER',
    days: [{ date: '2026-09-02', sessions: 2, minutes: 150 }],
    deliveryModes: [{ key: 'ONLINE', value: 2 }],
    nextSession: {
      id: 'next-1',
      title: 'Speaking practice',
      room: null,
      startsAt: '2026-09-02T13:00:00Z',
      endsAt: '2026-09-02T15:00:00Z',
      deliveryMode: 'ONLINE',
      status: 'SCHEDULED',
    },
    recentSessions: [],
  },
  OTP_OPERATOR: {
    kind: 'OTP_OPERATOR',
    days: [{ date: '2026-09-02', count: 10 }],
    pendingDispatch: 3,
    retryingDispatch: 1,
    lastRequestAt: '2026-09-02T09:00:00Z',
  },
};
