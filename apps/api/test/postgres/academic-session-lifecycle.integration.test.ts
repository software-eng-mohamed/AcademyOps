import { afterAll, expect, it } from 'vitest';
import { expectHttpErrorCode } from './error-helper';
import { sessionInput, setupAcademicSessionFixture } from './academic-session-test.helper';
import { createTestHarness } from './harness';

const { prisma, inRollbackTransaction, databaseDescribe } = createTestHarness();

databaseDescribe('PostgreSQL academic session lifecycle', () => {
  afterAll(async () => prisma.$disconnect());

  it('cancels idempotently, releases room/trainer bookings, and emits one durable event', async () => {
    await inRollbackTransaction(async (transaction) => {
      const fx = await setupAcademicSessionFixture(transaction);
      const startsAt = new Date(Date.now() + 86_400_000);
      const endsAt = new Date(startsAt.getTime() + 3_600_000);
      const session = await fx.mutations.create(
        fx.operationsAccess,
        sessionInput(fx, 1, startsAt, endsAt, {
          roomId: fx.room.id,
          trainers: [{ trainerId: fx.trainer.id }],
        }),
        'cancel-source-0001',
        'corr-cancel-source',
      );
      const input = { reason: 'Instructor is unavailable' };
      const cancelled = await fx.lifecycle.cancel(
        fx.operationsAccess,
        session.id,
        input,
        session.version,
        'cancel-command-001',
        'corr-cancel',
      );
      const replay = await fx.lifecycle.cancel(
        fx.operationsAccess,
        session.id,
        input,
        session.version,
        'cancel-command-001',
        'corr-cancel-retry',
      );
      expect(replay).toEqual(cancelled);
      expect(cancelled).toMatchObject({ status: 'CANCELLED', version: session.version + 1 });
      const assignments = await transaction.sessionTrainer.findMany({
        where: { organizationId: fx.org.id, sessionId: session.id },
      });
      expect(assignments.every(({ bookingStatus }) => bookingStatus === 'CANCELLED')).toBe(true);

      const replacement = await fx.mutations.create(
        fx.operationsAccess,
        sessionInput(fx, 2, startsAt, endsAt, {
          roomId: fx.room.id,
          trainers: [{ trainerId: fx.trainer.id }],
        }),
        'replacement-after-cancel',
        'corr-replacement',
      );
      expect(replacement.status).toBe('SCHEDULED');
      expect(
        await transaction.outboxEvent.count({
          where: { aggregateId: session.id, type: 'session.cancelled' },
        }),
      ).toBe(1);
      expect(
        await transaction.auditEvent.count({
          where: { entityId: session.id, action: 'session.cancel' },
        }),
      ).toBe(1);
      await expectHttpErrorCode(
        () =>
          fx.lifecycle.cancel(
            fx.ownerAccess,
            session.id,
            input,
            cancelled.version,
            'cancel-twice-0001',
            'corr-cancel-twice',
          ),
        'SESSION_TRANSITION_INVALID',
      );
    });
  });

  it('only completes scheduled sessions after their end time and does so idempotently', async () => {
    await inRollbackTransaction(async (transaction) => {
      const fx = await setupAcademicSessionFixture(transaction);
      const futureStart = new Date(Date.now() + 86_400_000);
      const futureEnd = new Date(futureStart.getTime() + 3_600_000);
      const future = await fx.mutations.create(
        fx.ownerAccess,
        sessionInput(fx, 1, futureStart, futureEnd),
        'future-session-0001',
        'corr-future',
      );
      await expectHttpErrorCode(
        () =>
          fx.lifecycle.complete(
            fx.ownerAccess,
            future.id,
            {},
            future.version,
            'future-complete-01',
            'corr-future-complete',
          ),
        'SESSION_NOT_FINISHED',
      );

      const pastEnd = new Date(Date.now() - 3_600_000);
      const pastStart = new Date(pastEnd.getTime() - 3_600_000);
      const past = await fx.mutations.create(
        fx.operationsAccess,
        sessionInput(fx, 2, pastStart, pastEnd),
        'past-session-00001',
        'corr-past',
      );
      const command = { note: 'Academic delivery verified' };
      const completed = await fx.lifecycle.complete(
        fx.operationsAccess,
        past.id,
        command,
        past.version,
        'complete-command-01',
        'corr-complete',
      );
      const replay = await fx.lifecycle.complete(
        fx.operationsAccess,
        past.id,
        command,
        past.version,
        'complete-command-01',
        'corr-complete-retry',
      );
      expect(replay).toEqual(completed);
      expect(completed).toMatchObject({ status: 'COMPLETED', version: past.version + 1 });
      expect(
        await transaction.outboxEvent.count({
          where: { aggregateId: past.id, type: 'session.completed' },
        }),
      ).toBe(1);
      expect(
        await transaction.auditEvent.count({
          where: { entityId: past.id, action: 'session.complete' },
        }),
      ).toBe(1);
      await expectHttpErrorCode(
        () =>
          fx.lifecycle.cancel(
            fx.ownerAccess,
            past.id,
            { reason: 'Cannot cancel completed delivery' },
            completed.version,
            'cancel-completed-1',
            'corr-cancel-completed',
          ),
        'SESSION_TRANSITION_INVALID',
      );
    });
  });
});
