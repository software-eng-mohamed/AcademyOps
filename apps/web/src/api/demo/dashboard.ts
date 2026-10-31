import { aging, receivables } from './finance-fixtures';
import { roster } from './session-fixtures';
import {
  cents,
  type DemoContext,
  find,
  invalid,
  json,
  money,
  object,
  records,
  string,
  timestamp,
} from './shared';

export function handleDashboardRoute(ctx: DemoContext): Response | null {
  if (ctx.method !== 'GET' || ctx.path.join('/') !== 'dashboard/overview') return null;
  const { state, url } = ctx;
  const now = new Date();
  const toMonth = url.searchParams.get('toMonth') ?? now.toISOString().slice(0, 7);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  const fromMonth = url.searchParams.get('fromMonth') ?? start.toISOString().slice(0, 7);
  if (
    ![fromMonth, toMonth].every((value) => /^20\d{2}-(0[1-9]|1[0-2])$/.test(value)) ||
    fromMonth > toMonth
  )
    return invalid();
  const months = Array.from({ length: 6 }, (_, index) => {
    const value = new Date(`${toMonth}-01T00:00:00.000Z`);
    if (!Number.isFinite(value.getTime())) return now.toISOString().slice(0, 7);
    value.setUTCMonth(value.getUTCMonth() - 5 + index);
    return value.toISOString().slice(0, 7);
  });
  const finance = receivables(state);
  const age = aging(state);
  const overdue = age.rows.filter((row) => row.ageDays > 0);
  const sessions = records(state, 'sessions').filter(
    (item) => string(item.startsAt).slice(0, 10) === timestamp().slice(0, 10),
  );
  const attendance = records(state, 'attendance');
  const checkedIn = attendance.filter((item) =>
    ['PRESENT', 'LATE'].includes(string(item.status)),
  ).length;
  const leads = records(state, 'leads');
  const byState = Object.fromEntries(
    ['NEW', 'OPEN', 'QUALIFIED', 'WON', 'LOST', 'DISQUALIFIED'].map((key) => [
      key,
      leads.filter((item) => item.state === key).length,
    ]),
  );
  const currentCollections = records(state, 'payments')
    .filter((item) => item.status === 'POSTED' && string(item.receivedAt).startsWith(toMonth))
    .reduce((sum, item) => sum + (cents(item.amount) ?? 0) - (cents(item.refundedAmount) ?? 0), 0);
  const netCollections = records(state, 'payments')
    .filter((item) => item.status === 'POSTED')
    .reduce((sum, item) => sum + (cents(item.amount) ?? 0) - (cents(item.refundedAmount) ?? 0), 0);
  const approvals = ['refundRequests', 'reversalRequests']
    .flatMap((collection) => records(state, collection))
    .filter((item) => item.status === 'REQUESTED')
    .map((item) => ({
      id: item.id,
      type: item.kind,
      entityType: 'PAYMENT',
      entityId: item.paymentId,
      submittedAt: item.createdAt,
      ...(item.requestedAmount ? { amount: item.requestedAmount, currencyCode: 'EGP' } : {}),
      version: item.version,
    }));
  return json({
    generatedAt: timestamp(),
    timezone: 'Africa/Cairo',
    selectedBranchId: url.searchParams.get('branchId'),
    range: {
      fromMonth,
      toMonth,
      from: `${fromMonth}-01T00:00:00.000Z`,
      toExclusive: new Date(
        Date.UTC(Number(toMonth.slice(0, 4)), Number(toMonth.slice(5, 7)), 1),
      ).toISOString(),
      timeZone: 'Africa/Cairo',
    },
    branches: records(state, 'branches'),
    kpis: {
      activeStudents: records(state, 'students').length,
      activeCohorts: records(state, 'cohorts').length,
      attendanceRate: attendance.length ? (checkedIn / attendance.length).toFixed(4) : '0.0000',
      currencyCode: 'EGP',
      netCollectionsInPeriod: money(netCollections),
      netCollectionsThisMonth: money(currentCollections),
      outstandingBalance: finance.totals.outstanding,
    },
    trends: {
      enrollments: months.map((period, index) => ({
        period,
        value: index === 5 ? records(state, 'enrollments').length : ([4, 7, 5, 9, 10][index] ?? 0),
      })),
      collections: months.map((period) => ({
        period,
        value: records(state, 'payments')
          .filter((item) => item.status === 'POSTED' && string(item.receivedAt).startsWith(period))
          .reduce((sum, item) => sum + Number(item.amount) - Number(item.refundedAmount ?? 0), 0),
      })),
      attendanceHealth: { healthy: 8, nearThreshold: 2, belowMinimum: 1, noData: 1 },
    },
    financeHealth: {
      aging: {
        current: age.totals.CURRENT,
        days1To30: age.totals['1_30'],
        days31To60: '0.00',
        days61To90: '0.00',
        days91Plus: '0.00',
      },
      overdueBalance: age.totals['1_30'],
      overdueEnrollmentCount: age.rows.filter((row) => row.ageDays > 0).length,
      dueNext30Days: age.totals.CURRENT,
    },
    salesPipeline: {
      byState,
      openLeads: leads.filter((item) => ['NEW', 'OPEN', 'QUALIFIED'].includes(string(item.state)))
        .length,
      newLeadsThisMonth: leads.length,
      convertedLeadsThisMonth: byState.WON ?? 0,
      overdueFollowUps: 1,
    },
    attention: {
      total: overdue.length,
      bySeverity: { CRITICAL: 0, WARNING: overdue.length, INFO: 0 },
      items: overdue.slice(0, 5).map((row) => ({
        id: row.installmentId,
        entityId: row.enrollmentId,
        entityType: 'ENROLLMENT',
        reasonCode: 'INSTALLMENT_OVERDUE',
        severity: 'WARNING',
        occurredAt: timestamp(-1),
        context: {
          studentName:
            find(state, 'students', find(state, 'enrollments', row.enrollmentId)?.studentPersonId)
              ?.name ?? 'Sample learner',
        },
      })),
    },
    todaySessions: sessions.map((session) => {
      const entries = roster(state, session);
      const version = find(state, 'programVersions', object(session.cohort).programVersionId);
      const trainer = object(
        object(Array.isArray(session.trainers) ? session.trainers[0] : null).trainer,
      );
      return {
        id: session.id,
        cohort: session.cohort,
        program: find(state, 'programs', version?.programId) ?? { name: 'Professional learning' },
        room: session.room,
        trainer: { name: object(trainer.person).name ?? trainer.name ?? 'Studio mentor' },
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        deliveryMode: session.deliveryMode,
        status: session.status,
        attendanceWindowState: session.attendanceWindowState,
        attendance: {
          checkedIn: entries.filter((entry) =>
            ['PRESENT', 'LATE'].includes(string(entry.effectiveStatus)),
          ).length,
          expected: entries.length,
        },
      };
    }),
    approvals,
    recentActivity: records(state, 'audit-events')
      .slice(0, 8)
      .map((item) => ({ ...item, actionCode: item.action })),
    academyHealth: {
      failedOperations: 0,
      openImportIssues: 0,
      pendingApprovals: approvals.length,
      pendingCertificateUploads: 0,
    },
  });
}
