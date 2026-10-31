/** Read-only, permission-scoped projections. Counts are never sampled from preview lists. */
export type OverviewCount = { key: string; value: number };
export type StaffSession = {
  id: string;
  title: string | null;
  room: string | null;
  startsAt: string;
  endsAt: string | null;
  deliveryMode: string;
  status: string;
};
export type StaffOverview =
  | {
      kind: 'OPERATIONS';
      days: Array<{ date: string; scheduled: number; completed: number }>;
      registrations: OverviewCount[];
      deliveryModes: OverviewCount[];
      preparation: { missingRoom: number; missingTrainer: number };
    }
  | {
      kind: 'ACADEMIC';
      sessionStates: OverviewCount[];
      cohorts: {
        total: number;
        items: Array<{
          id: string;
          name: string;
          status: string;
          scheduled: number;
          completed: number;
          draft: number;
          cancelled: number;
        }>;
      };
    }
  | {
      kind: 'RECEPTION';
      days: Array<{ date: string; count: number }>;
      states: OverviewCount[];
      recent: Array<{ id: string; course: string | null; state: string; createdAt: string }>;
    }
  | {
      kind: 'ACCOUNTS';
      months: Array<{ month: string; amount: string }>;
      methods: Array<{ name: string | null; amount: string }>;
      monthPostedAmount: string;
      pending: { count: number; amount: string };
    }
  | {
      kind: 'ATTENDANCE';
      days: Array<{
        date: string;
        present: number;
        late: number;
        absent: number;
        excused: number;
        unmarked: number;
      }>;
      recordsToday: OverviewCount[];
      windows: OverviewCount[];
    }
  | {
      kind: 'TRAINER';
      days: Array<{ date: string; sessions: number; minutes: number }>;
      deliveryModes: OverviewCount[];
      nextSession: StaffSession | null;
      recentSessions: StaffSession[];
    }
  | {
      kind: 'OTP_OPERATOR';
      days: Array<{ date: string; count: number }>;
      pendingDispatch: number;
      retryingDispatch: number;
      lastRequestAt: string | null;
    };
