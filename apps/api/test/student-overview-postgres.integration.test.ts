import { randomUUID } from 'node:crypto';
import type { AccessContext, AccessScope, PermissionCode } from '@academyops/contracts';
import { afterAll, expect, it } from 'vitest';
import { AcademicService } from '../src/academic/academic.service';
import { StudentOverviewService } from '../src/reporting/student-overview.service';
import { StudentOverviewFinanceService } from '../src/reporting/student-overview-finance.service';
import { createTestHarness } from './postgres/harness';
import { setupStudentSelfServiceFixture } from './postgres/student-self-service-fixture';

const { prisma, databaseDescribe, inRollbackTransaction } = createTestHarness();
afterAll(() => prisma.$disconnect());
const now = new Date('2026-09-02T10:00:00Z');
function access(org: string, user: string, person?: string): AccessContext {
  const permissions: PermissionCode[] = [
    'academic.catalog.read',
    'enrollments.read',
    'attendance.read',
    'finance.balance.read',
    'payments.read',
  ];
  return {
    organizationId: org,
    actorUserId: user,
    studentPersonId: person,
    branchIds: new Set(),
    assignedResourceIds: new Set(),
    grants: new Map(permissions.map((p) => [p, new Set<AccessScope>(['S'])])),
  };
}
databaseDescribe('Rich student overview', () => {
  it('uses canonical ledger balances and partially paid installments, isolates students even with extra staff grants', async () => {
    await inRollbackTransaction(async (tx) => {
      const f = await setupStudentSelfServiceFixture(tx);
      const service = new StudentOverviewService(f.adapter, new StudentOverviewFinanceService());
      const ctx = access(f.orgA.id, f.studentAUser.id, f.personA.id);
      ctx.grants = new Map(
        [...ctx.grants].map(([code, scopes]) => [code, new Set<AccessScope>([...scopes, 'O'])]),
      );
      const result = await service.read(ctx, { organizationId: f.orgA.id, id: { in: [] } }, now);
      expect(result.finance).toMatchObject({
        totalDebits: '200.00',
        totalCredits: '40.00',
        balance: '160.00',
        installments: { total: 2, overdueAmount: '60.00' },
      });
      expect(result.finance?.installments.items.map((i) => [i.state, i.remaining])).toEqual([
        ['OVERDUE', '60.00'],
        ['UPCOMING', '100.00'],
      ]);
      expect(result.courses.items.map((c) => c.id)).toEqual([f.enrollmentA.id]);
      const other = await service.read(
        access(f.orgA.id, f.studentBUser.id, f.personB.id),
        { organizationId: f.orgA.id, id: { in: [] } },
        now,
      );
      expect(other.finance?.balance).toBe('0.00');
      expect(other.finance?.installments.total).toBe(0);
      expect(other.courses.items.map((c) => c.id)).toEqual([f.enrollmentB.id]);
      const absent = await service.read(
        access(f.orgA.id, f.studentAUser.id),
        { organizationId: f.orgA.id, id: { in: [] } },
        now,
      );
      expect(absent.courses.total).toBe(0);
      expect(absent.finance?.balance).toBe('0.00');
      const foreign = await service.read(
        access(f.orgB.id, f.studentCUser.id, f.personA.id),
        { organizationId: f.orgB.id, id: { in: [] } },
        now,
      );
      expect(foreign.courses.total).toBe(0);
      expect(foreign.finance?.balance).toBe('0.00');
    });
  });
  it('gates optional sections by self permission instead of broadening or fabricating zeroes', async () => {
    await inRollbackTransaction(async (tx) => {
      const f = await setupStudentSelfServiceFixture(tx);
      const ctx = access(f.orgA.id, f.studentAUser.id, f.personA.id);
      const grants = new Map(ctx.grants);
      for (const key of ['attendance.read', 'finance.balance.read', 'payments.read'] as const)
        grants.set(key, new Set(['O']));
      ctx.grants = grants;
      const result = await new StudentOverviewService(
        f.adapter,
        new StudentOverviewFinanceService(),
      ).read(ctx, { organizationId: f.orgA.id, id: { in: [] } }, now);
      expect(result).toMatchObject({ finance: null, attendance: null, payments: null });
      expect(result.courses.total).toBe(1);
    });
  });
  it('returns the next session beyond this week, correct course labels, and only own attendance', async () => {
    await inRollbackTransaction(async (tx) => {
      const f = await setupStudentSelfServiceFixture(tx);
      const cm = await tx.cohortModule.create({
        data: {
          organizationId: f.orgA.id,
          cohortId: f.cohortA.id,
          programVersionModuleId: f.pvmA.id,
          ordinal: 1,
        },
      });
      const session = await tx.session.create({
        data: {
          organizationId: f.orgA.id,
          cohortId: f.cohortA.id,
          cohortModuleId: cm.id,
          ordinal: 1,
          deliveryMode: 'ONLINE',
          status: 'SCHEDULED',
          startsAt: new Date('2026-09-20T10:00:00Z'),
          endsAt: new Date('2026-09-20T12:00:00Z'),
        },
      });
      const prior = await tx.session.create({
        data: {
          organizationId: f.orgA.id,
          cohortId: f.cohortA.id,
          cohortModuleId: cm.id,
          ordinal: 2,
          deliveryMode: 'ONLINE',
          status: 'COMPLETED',
          startsAt: new Date('2026-09-01T10:00:00Z'),
          endsAt: new Date('2026-09-01T12:00:00Z'),
        },
      });
      await tx.attendanceRecord.createMany({
        data: [
          {
            organizationId: f.orgA.id,
            sessionId: prior.id,
            enrollmentId: f.enrollmentA.id,
            currentStatus: 'LATE',
            source: 'MANUAL',
            recordedAt: now,
          },
          {
            organizationId: f.orgA.id,
            sessionId: prior.id,
            enrollmentId: f.enrollmentB.id,
            currentStatus: 'ABSENT',
            source: 'MANUAL',
            recordedAt: now,
          },
        ],
      });
      const ctx = access(f.orgA.id, f.studentAUser.id, f.personA.id);
      const ids = await new AcademicService(f.adapter).visibleSessionIds(ctx);
      const result = await new StudentOverviewService(
        f.adapter,
        new StudentOverviewFinanceService(),
      ).read(ctx, { organizationId: f.orgA.id, id: { in: ids } }, now);
      expect(result.nextSession).toMatchObject({
        id: session.id,
        title: f.moduleA.name,
        startsAt: '2026-09-20T10:00:00.000Z',
        endsAt: '2026-09-20T12:00:00.000Z',
      });
      expect(result.schedule).toMatchObject({
        total: 0,
        items: [],
        from: '2026-09-01T21:00:00.000Z',
        to: '2026-09-08T21:00:00.000Z',
      });
      expect(result.attendance).toMatchObject({
        numerator: 1,
        denominator: 1,
        ratio: 1,
        late: 1,
        absent: 0,
      });
    });
  });
  it('buckets only posted payments by Cairo month, preserves cents, and omits pending payments', async () => {
    await inRollbackTransaction(async (tx) => {
      const f = await setupStudentSelfServiceFixture(tx);
      const method = await tx.paymentMethod.create({
        data: { organizationId: f.orgA.id, code: randomUUID().slice(0, 8), name: 'Cash' },
      });
      await tx.payment.create({
        data: {
          organizationId: f.orgA.id,
          billingAccountId: f.billingA.id,
          enrollmentId: f.enrollmentA.id,
          methodId: method.id,
          status: 'POSTED',
          amount: '40.00',
          ledgerEntryId: f.credit1.id,
          postedAt: now,
          receivedAt: new Date('2026-08-31T21:05:00Z'),
          idempotencyKey: randomUUID(),
          createdBy: f.studentAUser.id,
        },
      });
      await tx.payment.create({
        data: {
          organizationId: f.orgA.id,
          billingAccountId: f.billingA.id,
          enrollmentId: f.enrollmentA.id,
          methodId: method.id,
          status: 'PENDING_VERIFICATION',
          amount: '999.55',
          receivedAt: now,
          idempotencyKey: randomUUID(),
          createdBy: f.studentAUser.id,
        },
      });
      const centsCredit = await tx.ledgerEntry.create({
        data: {
          organizationId: f.orgA.id,
          billingAccountId: f.billingA.id,
          enrollmentId: f.enrollmentA.id,
          direction: 'CREDIT',
          entryType: 'PAYMENT',
          amount: '0.55',
          sourceType: 'PAYMENT',
          sourceId: randomUUID(),
        },
      });
      await tx.payment.create({
        data: {
          organizationId: f.orgA.id,
          billingAccountId: f.billingA.id,
          enrollmentId: f.enrollmentA.id,
          methodId: method.id,
          status: 'POSTED',
          amount: '0.55',
          ledgerEntryId: centsCredit.id,
          postedAt: now,
          receivedAt: now,
          idempotencyKey: randomUUID(),
          createdBy: f.studentAUser.id,
        },
      });
      const result = await new StudentOverviewService(
        f.adapter,
        new StudentOverviewFinanceService(),
      ).read(
        access(f.orgA.id, f.studentAUser.id, f.personA.id),
        { organizationId: f.orgA.id, id: { in: [] } },
        now,
      );
      expect(result.payments?.months).toHaveLength(6);
      expect(result.payments?.months.at(-1)).toEqual({ month: '2026-09', amount: '40.55' });
      expect(result.payments?.total).toBe('40.55');
      expect(result.finance?.balance).toBe('159.45');
    });
  });
});
