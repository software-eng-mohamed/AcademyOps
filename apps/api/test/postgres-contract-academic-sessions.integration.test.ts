import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { createTestHarness } from './postgres/harness';
const { prisma, inRollbackTransaction, expectDatabaseRejection, databaseDescribe } =
  createTestHarness();
databaseDescribe('PostgreSQL contract - Academic Sessions', () => {
  afterAll(async () => prisma.$disconnect());
  it('rejects active sessions that overlap in the same room', async () => {
    await inRollbackTransaction(async (transaction) => {
      const organization = await transaction.organization.create({
        data: { code: `ROOM-${randomUUID()}`, name: 'Test' },
      });
      const branch = await transaction.branch.create({
        data: {
          organizationId: organization.id,
          code: 'MAIN',
          name: 'Main',
        },
      });
      const room = await transaction.room.create({
        data: {
          organizationId: organization.id,
          branchId: branch.id,
          code: 'R1',
          name: 'Room 1',
        },
      });
      const program = await transaction.program.create({
        data: {
          organizationId: organization.id,
          code: 'PROGRAM',
          name: 'Program',
        },
      });
      const programVersion = await transaction.programVersion.create({
        data: { organizationId: organization.id, programId: program.id, version: 1 },
      });
      const academicModule = await transaction.academicModule.create({
        data: {
          organizationId: organization.id,
          code: 'MODULE',
          name: 'Module',
        },
      });
      const versionModule = await transaction.programVersionModule.create({
        data: {
          organizationId: organization.id,
          programVersionId: programVersion.id,
          moduleId: academicModule.id,
          ordinal: 1,
        },
      });
      const cohort = await transaction.cohort.create({
        data: {
          organizationId: organization.id,
          programVersionId: programVersion.id,
          owningBranchId: branch.id,
          code: 'COHORT',
        },
      });
      const cohortModule = await transaction.cohortModule.create({
        data: {
          organizationId: organization.id,
          cohortId: cohort.id,
          programVersionModuleId: versionModule.id,
          ordinal: 1,
        },
      });
      const firstSession = await transaction.session.create({
        data: {
          organizationId: organization.id,
          cohortModuleId: cohortModule.id,
          cohortId: cohort.id,
          roomId: room.id,
          ordinal: 1,
          startsAt: new Date('2026-09-01T09:00:00Z'),
          endsAt: new Date('2026-09-01T11:00:00Z'),
          deliveryMode: 'IN_PERSON',
          status: 'SCHEDULED',
        },
      });
      await expectDatabaseRejection(transaction, () =>
        transaction.session.create({
          data: {
            organizationId: organization.id,
            cohortModuleId: cohortModule.id,
            cohortId: cohort.id,
            roomId: room.id,
            ordinal: 2,
            startsAt: new Date('2026-09-01T10:00:00Z'),
            endsAt: new Date('2026-09-01T12:00:00Z'),
            deliveryMode: 'IN_PERSON',
            status: 'SCHEDULED',
          },
        }),
      );
      const otherCohort = await transaction.cohort.create({
        data: {
          organizationId: organization.id,
          programVersionId: programVersion.id,
          owningBranchId: branch.id,
          code: 'OTHER-COHORT',
        },
      });
      await expectDatabaseRejection(transaction, () =>
        transaction.session.create({
          data: {
            organizationId: organization.id,
            cohortModuleId: cohortModule.id,
            cohortId: otherCohort.id,
            roomId: room.id,
            ordinal: 1,
            startsAt: new Date('2026-09-02T09:00:00Z'),
            endsAt: new Date('2026-09-02T11:00:00Z'),
            deliveryMode: 'IN_PERSON',
            status: 'SCHEDULED',
          },
        }),
      );
      const trainerPerson = await transaction.person.create({
        data: {
          organizationId: organization.id,
          publicId: `TRAINER-${randomUUID().slice(0, 20)}`,
          name: 'Trainer',
        },
      });
      const trainer = await transaction.trainerProfile.create({
        data: { organizationId: organization.id, personId: trainerPerson.id },
      });
      const assignment = await transaction.sessionTrainer.create({
        data: {
          organizationId: organization.id,
          sessionId: firstSession.id,
          trainerId: trainer.id,
          startsAt: firstSession.startsAt,
          endsAt: firstSession.endsAt,
        },
      });
      await transaction.session.update({
        where: { id: firstSession.id },
        data: {
          startsAt: new Date('2026-09-01T13:00:00Z'),
          endsAt: new Date('2026-09-01T15:00:00Z'),
        },
      });
      const syncedAssignment = await transaction.sessionTrainer.findUniqueOrThrow({
        where: { id: assignment.id },
      });
      expect(syncedAssignment.startsAt?.toISOString()).toBe('2026-09-01T13:00:00.000Z');
      expect(syncedAssignment.endsAt?.toISOString()).toBe('2026-09-01T15:00:00.000Z');
    });
  });
});
