import { defaultRoleGrants, workspaceOverviewRoles } from '@academyops/contracts';
import type { AccessContext, WorkspaceOverviewRole } from '@academyops/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceOverviewService } from '../src/reporting/workspace-overview.service';

function harness(role: WorkspaceOverviewRole) {
  const access: AccessContext = {
    organizationId: 'org',
    actorUserId: 'user',
    branchIds: new Set(['branch']),
    assignedResourceIds: new Set(),
    studentPersonId: 'student',
    grants: new Map(defaultRoleGrants[role].map(([code, scope]) => [code, new Set([scope])])),
  };
  const db = {
    session: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    cohort: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    room: { findMany: vi.fn().mockResolvedValue([]) },
    enrollment: { count: vi.fn().mockResolvedValue(0) },
  };
  const academic = {
    visibleSessionIds: vi
      .fn<(access: AccessContext) => Promise<string[] | undefined>>()
      .mockResolvedValue(['visible-session']),
  };
  const catalog = { visibleCohortIds: vi.fn().mockResolvedValue(['visible-cohort']) };
  const enrollments = { visibleEnrollmentIds: vi.fn().mockResolvedValue(['visible-enrollment']) };
  const payments = {
    read: vi
      .fn()
      .mockResolvedValue({ metrics: [], queue: { kind: 'PAYMENTS', total: 0, items: [] } }),
  };
  const otp = {
    read: vi.fn().mockResolvedValue({
      state: 'DISABLED',
      enabled: false,
      otpAvailable: false,
      needsQr: false,
      phoneMasked: null,
      lastConnectedAt: null,
      lastHeartbeatAt: null,
      secret: 'must-not-leak',
      qrExpiresAt: 'hidden',
      lastErrorCode: 'hidden',
    }),
  };
  const service = new WorkspaceOverviewService(
    db as never,
    academic as never,
    catalog as never,
    enrollments as never,
    payments as never,
    otp as never,
    { read: vi.fn().mockResolvedValue(null) } as never,
    { read: vi.fn().mockResolvedValue(undefined) } as never,
  );
  return { access, db, academic, enrollments, payments, otp, service };
}
afterEach(() => vi.useRealTimers());
describe('Workspace overview policy and projections', () => {
  it.each(workspaceOverviewRoles)('supports %s using its default grants', async (role) => {
    const h = harness(role);
    const result = await h.service.overview(h.access, role);
    expect(result.role).toBe(role);
    expect(result.timezone).toBe('Africa/Cairo');
    if (!['OTP_OPERATOR', 'ACCOUNTS'].includes(role)) {
      expect(result.metrics).toHaveLength(3);
      expect(result.metrics.every((item) => item.value === 0)).toBe(true);
    }
    expect(result).not.toHaveProperty('financeHealth');
  });
  it.each(workspaceOverviewRoles)('denies no-grant access to %s before querying', async (role) => {
    const h = harness(role);
    h.access.grants = new Map();
    await expect(h.service.overview(h.access, role)).rejects.toMatchObject({ status: 403 });
    expect(h.academic.visibleSessionIds).not.toHaveBeenCalled();
    expect(h.payments.read).not.toHaveBeenCalled();
    expect(h.otp.read).not.toHaveBeenCalled();
  });
  it('rejects a self-only grant requesting a staff workspace', async () => {
    const h = harness('STUDENT');
    await expect(h.service.overview(h.access, 'OPERATIONS')).rejects.toMatchObject({ status: 403 });
  });
  it.each(['STUDENT', 'TRAINER'] as const)(
    'keeps %s personal despite additional organization grants',
    async (role) => {
      const h = harness(role);
      h.access.grants = new Map([
        ...h.access.grants,
        ['academic.catalog.read', new Set(['O', 'A', 'S'])],
      ]);
      await h.service.overview(h.access, role);
      expect(
        h.academic.visibleSessionIds.mock.calls[0]![0].grants.get('academic.catalog.read'),
      ).toEqual(new Set([role === 'STUDENT' ? 'S' : 'A']));
    },
  );
  it('uses Cairo day boundaries and a bounded queue with scoped filters', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-02T09:00:00Z'));
    const h = harness('ATTENDANCE');
    h.db.cohort.findMany.mockResolvedValue([{ id: 'branch-cohort' }] as never);
    h.db.session.findMany.mockResolvedValueOnce([{ id: 'visible-session' }] as never);
    h.db.session.count.mockResolvedValue(10);
    const result = await h.service.overview(h.access, 'ATTENDANCE');
    expect(result.queue?.total).toBe(10);
    expect(h.db.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 6,
        where: {
          organizationId: 'org',
          id: { in: ['visible-session'] },
          startsAt: { gte: new Date('2026-09-01T21:00:00Z'), lt: new Date('2026-09-02T21:00:00Z') },
          status: { in: ['SCHEDULED', 'COMPLETED'] },
        },
      }),
    );
  });
  it('does not present channel errors, secrets, or QR data', async () => {
    const h = harness('OTP_OPERATOR');
    const result = await h.service.overview(h.access, 'OTP_OPERATOR');
    expect(result.channel).toEqual({
      state: 'DISABLED',
      enabled: false,
      otpAvailable: false,
      needsQr: false,
      phoneMasked: null,
      lastConnectedAt: null,
      lastHeartbeatAt: null,
    });
    expect(result.metrics).toEqual([]);
    expect(result.queue).toBeNull();
  });
});
