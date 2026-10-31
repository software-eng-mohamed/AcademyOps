import type { StudentOverview } from '@academyops/api-client/workspace-overview';

export function studentOverviewFixture(): StudentOverview {
  const session = {
    id: 'session-1',
    title: 'Conversation practice',
    cohort: 'English A2',
    room: 'Room 4',
    startsAt: '2026-09-02T10:00:00Z',
    endsAt: '2026-09-02T12:00:00Z',
    deliveryMode: 'IN_PERSON',
    status: 'SCHEDULED',
  };
  return {
    nextSession: session,
    schedule: {
      from: '2026-09-01T21:00:00Z',
      to: '2026-09-08T21:00:00Z',
      total: 1,
      items: [session],
    },
    courses: { total: 1, items: [{ id: 'course-1', name: 'English A2', state: 'ACTIVE' }] },
    attendance: {
      numerator: 9,
      denominator: 10,
      ratio: 0.9,
      present: 8,
      late: 1,
      absent: 1,
      excused: 2,
      unmarked: 1,
    },
    finance: {
      currency: 'EGP',
      totalDebits: '2000.00',
      totalCredits: '1876.55',
      balance: '123.45',
      installments: {
        total: 1,
        overdueAmount: '123.45',
        items: [
          {
            id: 'installment-1',
            ordinal: 2,
            course: 'English A2',
            dueDate: '2026-09-01',
            amount: '500.00',
            remaining: '123.45',
            state: 'OVERDUE',
          },
        ],
      },
    },
    payments: {
      total: '1876.55',
      months: ['04', '05', '06', '07', '08', '09'].map((month) => ({
        month: `2026-${month}`,
        amount: month === '09' ? '1876.55' : '0.00',
      })),
    },
  };
}
