import { afterAll, expect, it } from 'vitest';
import type { AccessContext } from '@academyops/contracts';
import { AcademicService } from '../../src/academic/academic.service';
import { CatalogService } from '../../src/academic/catalog.service';
import { createCatalogTestModule } from './catalog-test-module';
import { createTestHarness } from './harness';
import { setupStudentSelfServiceFixture } from './student-self-service-fixture';

const harness = createTestHarness();

harness.databaseDescribe('Student calendar cohort transfer windows', () => {
  afterAll(async () => {
    await harness.prisma.$disconnect();
  });

  it(
    'shows sessions only while each cohort assignment is effective',
    () =>
      harness.inRollbackTransaction(async (transaction) => {
        const fx = await setupStudentSelfServiceFixture(transaction);
        const transferAt = new Date('2026-08-10T00:00:00Z');
        const oldAssignment = await transaction.enrollmentCohortAssignment.findFirstOrThrow({
          where: {
            organizationId: fx.orgA.id,
            enrollmentId: fx.enrollmentA.id,
            cohortId: fx.cohortA.id,
          },
        });
        await transaction.enrollmentCohortAssignment.update({
          where: { id: oldAssignment.id },
          data: { endsAt: transferAt },
        });

        const newCohort = await transaction.cohort.create({
          data: {
            organizationId: fx.orgA.id,
            code: `TRANSFER-${fx.enrollmentA.id.slice(0, 8)}`,
            name: 'Transferred cohort',
            programVersionId: fx.versionA.id,
            owningBranchId: fx.branchA.id,
          },
        });
        const [oldModule, newModule] = await Promise.all([
          transaction.cohortModule.create({
            data: {
              organizationId: fx.orgA.id,
              cohortId: fx.cohortA.id,
              programVersionModuleId: fx.pvmA.id,
              ordinal: 1,
            },
          }),
          transaction.cohortModule.create({
            data: {
              organizationId: fx.orgA.id,
              cohortId: newCohort.id,
              programVersionModuleId: fx.pvmA.id,
              ordinal: 1,
            },
          }),
        ]);
        await transaction.enrollmentCohortAssignment.create({
          data: {
            organizationId: fx.orgA.id,
            enrollmentId: fx.enrollmentA.id,
            cohortId: newCohort.id,
            startsAt: transferAt,
            createdBy: fx.studentAUser.id,
          },
        });

        const createSession = (
          cohortId: string,
          cohortModuleId: string,
          ordinal: number,
          startsAt: string,
        ) =>
          transaction.session.create({
            data: {
              organizationId: fx.orgA.id,
              cohortId,
              cohortModuleId,
              ordinal,
              startsAt: new Date(startsAt),
              status: 'SCHEDULED',
              deliveryMode: 'IN_PERSON',
            },
          });
        const [oldBefore, oldAfter, newBefore, newAfter, draftDuringAssignment] = await Promise.all(
          [
            createSession(fx.cohortA.id, oldModule.id, 1, '2026-08-09T10:00:00Z'),
            createSession(fx.cohortA.id, oldModule.id, 2, '2026-08-11T10:00:00Z'),
            createSession(newCohort.id, newModule.id, 1, '2026-08-09T10:00:00Z'),
            createSession(newCohort.id, newModule.id, 2, '2026-08-11T10:00:00Z'),
            transaction.session.create({
              data: {
                organizationId: fx.orgA.id,
                cohortId: fx.cohortA.id,
                cohortModuleId: oldModule.id,
                ordinal: 3,
                startsAt: new Date('2026-08-09T12:00:00Z'),
                status: 'DRAFT',
                deliveryMode: 'IN_PERSON',
              },
            }),
          ],
        );

        const access: AccessContext = {
          organizationId: fx.orgA.id,
          actorUserId: fx.studentAUser.id,
          grants: new Map([['academic.catalog.read', new Set(['S'])]]),
          branchIds: new Set(),
          assignedResourceIds: new Set(),
          studentPersonId: fx.personA.id,
        };
        const catalogModule = await createCatalogTestModule(fx.adapter);
        const catalog = catalogModule.get(CatalogService);
        const result = await catalog.readCalendar(access, {
          from: '2026-08-01T00:00:00Z',
          to: '2026-09-01T00:00:00Z',
        });
        const ids = result.items.map(({ id }) => id);

        expect(ids).toContain(oldBefore.id);
        expect(ids).toContain(newAfter.id);
        expect(ids).not.toContain(oldAfter.id);
        expect(ids).not.toContain(newBefore.id);

        const academic = new AcademicService(fx.adapter);
        const directSessions = await academic.listSessions(access, {
          from: '2026-08-01T00:00:00Z',
          to: '2026-09-01T00:00:00Z',
          limit: 50,
        });
        const directIds = directSessions.items.map(({ id }) => id);
        expect(directIds).toContain(oldBefore.id);
        expect(directIds).toContain(newAfter.id);
        expect(directIds).not.toContain(oldAfter.id);
        expect(directIds).not.toContain(newBefore.id);
        expect(directIds).not.toContain(draftDuringAssignment.id);
        await expect(academic.readSession(access, oldAfter.id)).rejects.toMatchObject({
          response: { code: 'SESSION_NOT_FOUND' },
        });
        await catalogModule.close();
      }),
    15_000,
  );
});
