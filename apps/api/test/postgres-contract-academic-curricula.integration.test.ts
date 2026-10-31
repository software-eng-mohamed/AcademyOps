import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { createTestHarness } from './postgres/harness';
const { prisma, inRollbackTransaction, expectDatabaseRejection, databaseDescribe } =
  createTestHarness();
databaseDescribe('PostgreSQL contract - Academic Curricula', () => {
  afterAll(async () => prisma.$disconnect());
  it('locks published curricula and rejects active cohorts on draft versions', async () => {
    await inRollbackTransaction(async (transaction) => {
      const organization = await transaction.organization.create({
        data: { code: `CATALOG-${randomUUID()}`, name: 'Catalog Test' },
      });
      const branch = await transaction.branch.create({
        data: {
          organizationId: organization.id,
          code: 'MAIN',
          name: 'Main',
        },
      });
      const program = await transaction.program.create({
        data: {
          organizationId: organization.id,
          code: 'PROGRAM',
          name: 'Program',
        },
      });
      const draftVersion = await transaction.programVersion.create({
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
          programVersionId: draftVersion.id,
          moduleId: academicModule.id,
          ordinal: 1,
        },
      });
      await expectDatabaseRejection(transaction, () =>
        transaction.cohort.create({
          data: {
            organizationId: organization.id,
            programVersionId: draftVersion.id,
            owningBranchId: branch.id,
            code: 'INVALID-ACTIVE',
            status: 'ACTIVE',
          },
        }),
      );
      await transaction.programVersion.update({
        where: { id: draftVersion.id },
        data: { status: 'PUBLISHED', effectiveFrom: new Date('2026-09-01') },
      });
      await expectDatabaseRejection(transaction, () =>
        transaction.programVersion.update({
          where: { id: draftVersion.id },
          data: { status: 'DRAFT' },
        }),
      );
      await expectDatabaseRejection(transaction, () =>
        transaction.programVersionModule.update({
          where: { id: versionModule.id },
          data: { required: false },
        }),
      );
      await expectDatabaseRejection(transaction, () =>
        transaction.programVersionModule.delete({ where: { id: versionModule.id } }),
      );
      const activeCohortDraft = await transaction.cohort.create({
        data: {
          organizationId: organization.id,
          programVersionId: draftVersion.id,
          owningBranchId: branch.id,
          code: 'ACTIVE',
        },
      });
      await transaction.cohort.update({
        where: { id: activeCohortDraft.id },
        data: { status: 'PLANNED' },
      });
      const activeCohort = await transaction.cohort.update({
        where: { id: activeCohortDraft.id },
        data: { status: 'ACTIVE' },
      });
      expect(activeCohort.status).toBe('ACTIVE');
    });
  });
});
