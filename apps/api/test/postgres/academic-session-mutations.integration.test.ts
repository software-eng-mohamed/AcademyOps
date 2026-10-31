import { afterAll, expect, it } from 'vitest';
import { createTestHarness } from './harness';
import { expectHttpErrorCode } from './error-helper';
import { sessionInput, setupAcademicSessionFixture } from './academic-session-test.helper';

const { prisma, inRollbackTransaction, databaseDescribe } = createTestHarness();

databaseDescribe('PostgreSQL academic session mutations', () => {
  afterAll(async () => prisma.$disconnect());

  it('enforces Owner/Operations permission scope without leaking cross-tenant resources', async () => {
    await inRollbackTransaction(async (transaction) => {
      const fx = await setupAcademicSessionFixture(transaction);
      const start = new Date(Date.now() + 86_400_000);
      const end = new Date(start.getTime() + 3_600_000);
      const input = sessionInput(fx, 1, start, end);

      const created = await fx.mutations.create(
        fx.operationsAccess,
        input,
        'operations-create-01',
        'corr-operations',
      );
      const replay = await fx.mutations.create(
        fx.operationsAccess,
        input,
        'operations-create-01',
        'corr-operations-retry',
      );
      expect(created.status).toBe('SCHEDULED');
      expect(replay).toEqual(created);
      expect(
        await transaction.outboxEvent.count({
          where: { aggregateId: created.id, type: 'session.created' },
        }),
      ).toBe(1);
      expect(
        await transaction.auditEvent.count({
          where: { entityId: created.id, action: 'session.create' },
        }),
      ).toBe(1);

      await expectHttpErrorCode(
        () =>
          fx.mutations.create(
            fx.deniedAccess,
            sessionInput(fx, 2, start, end),
            'denied-create-0001',
            'corr-denied',
          ),
        'PERMISSION_DENIED',
      );
      await expectHttpErrorCode(
        () =>
          fx.mutations.create(
            fx.wrongBranchAccess,
            sessionInput(fx, 2, start, end),
            'wrong-branch-0001',
            'corr-wrong-branch',
          ),
        'COHORT_NOT_FOUND',
      );
    });
  });

  it('validates time, room, trainer tenant and duplicate assignments', async () => {
    await inRollbackTransaction(async (transaction) => {
      const fx = await setupAcademicSessionFixture(transaction);
      const start = new Date(Date.now() + 86_400_000);
      const end = new Date(start.getTime() + 3_600_000);

      await expectHttpErrorCode(
        () =>
          fx.mutations.create(
            fx.ownerAccess,
            sessionInput(fx, 1, end, start),
            'invalid-time-0001',
            'corr-time',
          ),
        'SESSION_TIME_INVALID',
      );
      await expectHttpErrorCode(
        () =>
          fx.mutations.create(
            fx.ownerAccess,
            sessionInput(fx, 1, start, end, { roomId: fx.otherRoom.id }),
            'wrong-room-000001',
            'corr-room',
          ),
        'ROOM_NOT_FOUND',
      );
      await expectHttpErrorCode(
        () =>
          fx.mutations.create(
            fx.ownerAccess,
            sessionInput(fx, 1, start, end, { roomId: fx.foreignRoom.id }),
            'foreign-room-0001',
            'corr-foreign-room',
          ),
        'ROOM_NOT_FOUND',
      );
      await expectHttpErrorCode(
        () =>
          fx.mutations.create(
            fx.ownerAccess,
            sessionInput(fx, 1, start, end, {
              trainers: [{ trainerId: fx.foreignTrainer.id }],
            }),
            'foreign-trainer-01',
            'corr-foreign-trainer',
          ),
        'TRAINER_NOT_FOUND',
      );
      await expectHttpErrorCode(
        () =>
          fx.mutations.create(
            fx.ownerAccess,
            sessionInput(fx, 1, start, end, {
              trainers: [
                { trainerId: fx.trainer.id, role: 'PRIMARY' },
                { trainerId: fx.trainer.id, role: 'ASSISTANT' },
              ],
            }),
            'duplicate-trainer1',
            'corr-duplicate-trainer',
          ),
        'SESSION_TRAINER_DUPLICATE',
      );
    });
  });

  it('prevents room/trainer overlap and reschedules room plus trainer assignments idempotently', async () => {
    await inRollbackTransaction(async (transaction) => {
      const fx = await setupAcademicSessionFixture(transaction);
      const firstStart = new Date(Date.now() + 86_400_000);
      const firstEnd = new Date(firstStart.getTime() + 3_600_000);
      const first = await fx.mutations.create(
        fx.operationsAccess,
        sessionInput(fx, 1, firstStart, firstEnd, {
          roomId: fx.room.id,
          trainers: [{ trainerId: fx.trainer.id }],
        }),
        'first-session-0001',
        'corr-first',
      );

      await expectHttpErrorCode(
        () =>
          fx.mutations.create(
            fx.operationsAccess,
            sessionInput(fx, 2, firstStart, firstEnd, { roomId: fx.room.id }),
            'room-conflict-001',
            'corr-room-conflict',
          ),
        'SCHEDULE_CONFLICT',
      );
      await expectHttpErrorCode(
        () =>
          fx.mutations.create(
            fx.operationsAccess,
            sessionInput(fx, 2, firstStart, firstEnd, {
              trainers: [{ trainerId: fx.trainer.id }],
            }),
            'trainer-conflict1',
            'corr-trainer-conflict',
          ),
        'SCHEDULE_CONFLICT',
      );

      const blockedStart = new Date(firstStart.getTime() + 7_200_000);
      const blockedEnd = new Date(blockedStart.getTime() + 3_600_000);
      await fx.mutations.create(
        fx.operationsAccess,
        sessionInput(fx, 2, blockedStart, blockedEnd, {
          trainers: [{ trainerId: fx.trainer.id }],
        }),
        'blocker-session-01',
        'corr-blocker',
      );
      await expectHttpErrorCode(
        () =>
          fx.mutations.reschedule(
            fx.ownerAccess,
            first.id,
            {
              startsAt: blockedStart.toISOString(),
              endsAt: blockedEnd.toISOString(),
              reason: 'Trainer conflict proof',
            },
            first.version,
            'reschedule-blocked1',
            'corr-reschedule-blocked',
          ),
        'SCHEDULE_CONFLICT',
      );

      const targetStart = new Date(blockedStart.getTime() + 7_200_000);
      const targetEnd = new Date(targetStart.getTime() + 3_600_000);
      const command = {
        startsAt: targetStart.toISOString(),
        endsAt: targetEnd.toISOString(),
        roomId: fx.replacementRoom.id,
        reason: 'Move to the second room',
        trainers: [{ trainerId: fx.replacementTrainer.id, role: 'PRIMARY' as const }],
      };
      const updated = await fx.mutations.reschedule(
        fx.ownerAccess,
        first.id,
        command,
        first.version,
        'reschedule-success1',
        'corr-reschedule',
      );
      const replay = await fx.mutations.reschedule(
        fx.ownerAccess,
        first.id,
        command,
        first.version,
        'reschedule-success1',
        'corr-retry',
      );
      expect(replay).toEqual(updated);
      expect(updated.version).toBe(first.version + 1);
      const stored = await transaction.session.findUniqueOrThrow({ where: { id: first.id } });
      expect(stored.roomId).toBe(fx.replacementRoom.id);
      expect(stored.startsAt).toEqual(targetStart);
      const assignments = await transaction.sessionTrainer.findMany({
        where: { organizationId: fx.org.id, sessionId: first.id },
      });
      expect(assignments).toHaveLength(1);
      expect(assignments[0]?.trainerId).toBe(fx.replacementTrainer.id);
      expect(assignments[0]?.startsAt).toEqual(targetStart);
      expect(
        await transaction.outboxEvent.count({
          where: { aggregateId: first.id, type: 'session.rescheduled' },
        }),
      ).toBe(1);
      expect(
        await transaction.auditEvent.count({
          where: { entityId: first.id, action: 'session.reschedule' },
        }),
      ).toBe(1);
      await expectHttpErrorCode(
        () =>
          fx.mutations.reschedule(
            fx.ownerAccess,
            first.id,
            command,
            first.version,
            'stale-version-0001',
            'corr-stale',
          ),
        'VERSION_CONFLICT',
      );
    });
  });
});
