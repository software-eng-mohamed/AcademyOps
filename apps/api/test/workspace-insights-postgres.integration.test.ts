import { context, services } from './workspace-insights-support';
import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { setupAcademicSessionFixture } from './postgres/academic-session-test.helper';
import { setupStudentSelfServiceFixture } from './postgres/student-self-service-fixture';
import { createTestHarness } from './postgres/harness';

const { prisma, databaseDescribe, inRollbackTransaction } = createTestHarness();
afterAll(() => prisma.$disconnect());
const now = new Date('2026-09-02T10:00:00Z');
databaseDescribe('Distinct staff overview projections on PostgreSQL (rollback)', () => {
  it('counts the full operations week, excludes cancelled sessions, and checks future preparation only', async () => {
    await inRollbackTransaction(async (tx) => {
      const f = await setupAcademicSessionFixture(tx);
      const ids: string[] = [];
      for (let i = 0; i < 9; i++) {
        const session = await tx.session.create({
          data: {
            organizationId: f.org.id,
            cohortId: f.cohort.id,
            cohortModuleId: f.cohortModule.id,
            ordinal: i + 1,
            deliveryMode: 'ONLINE',
            status: i === 8 ? 'CANCELLED' : 'SCHEDULED',
            startsAt: new Date(`2026-09-02T${String(11 + i).padStart(2, '0')}:00:00Z`),
            endsAt: new Date(`2026-09-02T${String(11 + i).padStart(2, '0')}:30:00Z`),
          },
        });
        ids.push(session.id);
      }
      const svc = services(tx).learning;
      const ctx = context(f.org.id, f.ownerAccess.actorUserId);
      const result = await svc.read(ctx, 'OPERATIONS', now, ids);
      expect(result.kind).toBe('OPERATIONS');
      if (result.kind !== 'OPERATIONS') throw new Error('Wrong view');
      expect(result.days).toHaveLength(7);
      expect(result.days[0]).toEqual({ date: '2026-09-02', scheduled: 8, completed: 0 });
      expect(result.days[6]).toEqual({ date: '2026-09-08', scheduled: 0, completed: 0 });
      expect(result.preparation).toEqual({ missingTrainer: 8, missingRoom: 0 });
      expect(result.deliveryModes).toEqual([{ key: 'ONLINE', value: 8 }]);
      const empty = await svc.read(ctx, 'OPERATIONS', now, []);
      expect(empty.kind === 'OPERATIONS' && empty.days.every((d) => d.scheduled === 0)).toBe(true);
      const foreign = await svc.read(
        context(f.foreignTrainer.organizationId, f.foreignTrainer.id),
        'OPERATIONS',
        now,
        ids,
      );
      expect(foreign.kind === 'OPERATIONS' && foreign.preparation.missingTrainer).toBe(0);
    });
  });

  it('returns academic group states and exact session totals without enrollment access', async () => {
    await inRollbackTransaction(async (tx) => {
      const f = await setupAcademicSessionFixture(tx);
      for (const [i, status] of ['DRAFT', 'SCHEDULED', 'COMPLETED', 'CANCELLED'].entries()) {
        await tx.session.create({
          data: {
            organizationId: f.org.id,
            cohortId: f.cohort.id,
            cohortModuleId: f.cohortModule.id,
            ordinal: i + 1,
            deliveryMode: 'ONLINE',
            status,
            startsAt: new Date('2026-09-01T10:00:00Z'),
            endsAt: new Date('2026-09-01T11:00:00Z'),
          },
        });
      }
      const ctx = context(f.org.id, f.ownerAccess.actorUserId, 'B', [f.branch.id]);
      ctx.grants = new Map([['academic.catalog.read', new Set(['B'])]]);
      const result = await services(tx).learning.read(ctx, 'ACADEMIC', now, undefined);
      if (result.kind !== 'ACADEMIC') throw new Error('Wrong view');
      expect(result.sessionStates.reduce((sum, d) => sum + d.value, 0)).toBe(4);
      expect(result.cohorts.items.find((g) => g.id === f.cohort.id)).toMatchObject({
        scheduled: 1,
        completed: 1,
        draft: 1,
        cancelled: 1,
      });
      const other = await services(tx).learning.read(
        context(f.org.id, f.ownerAccess.actorUserId, 'B', [f.otherBranch.id]),
        'ACADEMIC',
        now,
        [],
      );
      expect(
        other.kind === 'ACADEMIC' && other.cohorts.items.some((g) => g.id === f.cohort.id),
      ).toBe(false);
    });
  });

  it('buckets registration creation by Cairo date and keeps branch totals separate from previews', async () => {
    await inRollbackTransaction(async (tx) => {
      const f = await setupStudentSelfServiceFixture(tx);
      await tx.enrollment.updateMany({
        where: { organizationId: f.orgA.id },
        data: { createdAt: new Date('2026-09-01T21:05:00Z') },
      });
      const branch = await tx.branch.create({
        data: { organizationId: f.orgA.id, code: randomUUID(), name: 'Other' },
      });
      await tx.enrollment.update({
        where: { id: f.enrollmentB.id },
        data: { homeBranchId: branch.id },
      });
      const ctx = context(f.orgA.id, f.studentAUser.id, 'B', [f.branchA.id]);
      const result = await services(tx).business.reception(ctx, now);
      if (result.kind !== 'RECEPTION') throw new Error('Wrong view');
      expect(result.days).toHaveLength(28);
      expect(result.days.at(-1)).toEqual({ date: '2026-09-02', count: 1 });
      expect(result.recent.map((r) => r.id)).toEqual([f.enrollmentA.id]);
      expect(result.recent[0]?.course).toBe(f.programA.name);
      expect(result.states.reduce((sum, d) => sum + d.value, 0)).toBe(1);
      const empty = await services(tx).business.reception(
        context(f.orgA.id, f.studentAUser.id, 'B'),
        now,
      );
      expect(empty.kind === 'RECEPTION' && empty.recent).toEqual([]);
    });
  });

  it('separates posted collection amounts from pending payments and preserves cents across Cairo months', async () => {
    await inRollbackTransaction(async (tx) => {
      const f = await setupStudentSelfServiceFixture(tx);
      const method = await tx.paymentMethod.create({
        data: { organizationId: f.orgA.id, code: randomUUID(), name: 'Cash' },
      });
      const payment = {
        organizationId: f.orgA.id,
        billingAccountId: f.billingA.id,
        enrollmentId: f.enrollmentA.id,
        methodId: method.id,
        createdBy: f.studentAUser.id,
      };
      await tx.payment.create({
        data: {
          ...payment,
          status: 'POSTED',
          amount: '40.00',
          ledgerEntryId: f.credit1.id,
          postedAt: now,
          receivedAt: new Date('2026-08-31T21:05:00Z'),
          idempotencyKey: randomUUID(),
        },
      });
      await tx.payment.create({
        data: {
          ...payment,
          status: 'PENDING_VERIFICATION',
          amount: '9.75',
          receivedAt: new Date('2026-08-31T20:59:00Z'),
          idempotencyKey: randomUUID(),
        },
      });
      const result = await services(tx).business.payments(
        context(f.orgA.id, f.studentAUser.id, 'B', [f.branchA.id]),
        now,
      );
      if (result.kind !== 'ACCOUNTS') throw new Error('Wrong view');
      expect(result.months).toHaveLength(6);
      expect(result.months.at(-1)).toEqual({ month: '2026-09', amount: '40.00' });
      expect(result.monthPostedAmount).toBe('40.00');
      expect(result.pending).toEqual({ count: 1, amount: '9.75' });
      expect(result.methods).toEqual([{ name: 'Cash', amount: '40.00' }]);
      const empty = await services(tx).business.payments(
        context(f.orgA.id, f.studentAUser.id, 'B'),
        now,
      );
      expect(empty.kind === 'ACCOUNTS' && empty.monthPostedAmount).toBe('0.00');
    });
  });

  it('counts raw attendance records only for visible started sessions, never infers absence', async () => {
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
      const s = await tx.session.create({
        data: {
          organizationId: f.orgA.id,
          cohortId: f.cohortA.id,
          cohortModuleId: cm.id,
          ordinal: 1,
          deliveryMode: 'ONLINE',
          status: 'SCHEDULED',
          startsAt: new Date('2026-09-02T09:00:00Z'),
          endsAt: new Date('2026-09-02T11:00:00Z'),
        },
      });
      await tx.attendanceRecord.createMany({
        data: [
          {
            organizationId: f.orgA.id,
            sessionId: s.id,
            enrollmentId: f.enrollmentA.id,
            currentStatus: 'PRESENT',
            source: 'MANUAL',
            recordedAt: now,
          },
          {
            organizationId: f.orgA.id,
            sessionId: s.id,
            enrollmentId: f.enrollmentB.id,
            currentStatus: 'EXCUSED',
            source: 'MANUAL',
            recordedAt: now,
          },
        ],
      });
      const result = await services(tx).learning.read(
        context(f.orgA.id, f.studentAUser.id),
        'ATTENDANCE',
        now,
        [s.id],
      );
      if (result.kind !== 'ATTENDANCE') throw new Error('Wrong view');
      expect(result.days.at(-1)).toMatchObject({
        date: '2026-09-02',
        present: 1,
        late: 0,
        absent: 0,
        excused: 1,
        unmarked: 0,
      });
      expect(result.windows).toEqual([{ key: 'SCHEDULED', value: 1 }]);
      expect(result.recordsToday).toHaveLength(2);
      const none = await services(tx).learning.read(
        context(f.orgA.id, f.studentAUser.id),
        'ATTENDANCE',
        now,
        [],
      );
      expect(none.kind === 'ATTENDANCE' && none.recordsToday).toEqual([]);
    });
  });

  it('returns only OTP request metadata, not payloads or delivery claims, and isolates organizations', async () => {
    await inRollbackTransaction(async (tx) => {
      const org = await tx.organization.create({ data: { code: randomUUID(), name: 'OTP test' } });
      const foreign = await tx.organization.create({
        data: { code: randomUUID(), name: 'Other OTP' },
      });
      const event = {
        organizationId: org.id,
        aggregateType: 'User',
        aggregateId: randomUUID(),
        type: 'security.phone_otp_requested',
        payload: { phone: '+201000000000', codeCipher: 'SECRET-CIPHER' },
        occurredAt: new Date('2026-09-01T21:01:00Z'),
      };
      await tx.outboxEvent.createMany({
        data: [
          event,
          { ...event, attempts: 2 },
          { ...event, processedAt: now },
          { ...event, organizationId: foreign.id },
          { ...event, type: 'security.password_reset_requested' },
        ],
      });
      const result = await services(tx).business.otp(context(org.id, randomUUID()), now);
      if (result.kind !== 'OTP_OPERATOR') throw new Error('Wrong view');
      expect(result.days).toHaveLength(7);
      expect(result.days.at(-1)).toEqual({ date: '2026-09-02', count: 3 });
      expect(result.pendingDispatch).toBe(2);
      expect(result.retryingDispatch).toBe(1);
      expect(JSON.stringify(result)).not.toMatch(
        /SECRET|201000000000|delivered|payload|codeCipher/,
      );
    });
  });
});
