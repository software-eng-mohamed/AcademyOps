import { randomUUID } from 'node:crypto';
import { permissions } from '@academyops/contracts';
import { describe, expect, it } from 'vitest';
import { seedApprovedFinance } from './business-chain-fixture';
import { intakeResponse as body, seedIntakeEnrollment } from './cohort-intake-fixture';
import { runIntakeCancellationStep } from './cohort-intake-cancellation.step';
import { runAcademicCatalogHttpStep } from './domain-academic-catalog-http.step';
import { get, patch, post } from './finance-http-client';
import { runHttpScenario } from './http-test-harness';

const databaseDescribe =
  process.env.DATABASE_URL && process.env.REDIS_URL ? describe : describe.skip;

databaseDescribe('Confirmed-only, fill-to-start intake over authenticated HTTP', () => {
  it('opens without dates, waits for actual approvals, recalculates after changes and requires explicit scheduled start', async () => {
    await runHttpScenario({ permissions: [...permissions], roleCode: 'OWNER' }, async (context) => {
      const catalog = await runAcademicCatalogHttpStep(context);
      const created = await body(
        await post(context, 'cohorts', {
          programVersionId: catalog.programVersionId,
          owningBranchId: context.branchId,
          code: `INTAKE-${randomUUID().slice(0, 8)}`,
          capacity: 2,
        }),
        201,
      );
      const cohortId = String(created.id);
      let version = 1;
      const command = (name: string) =>
        post(
          context,
          `cohorts/${cohortId}/${name}`,
          { reason: 'Confirmed intake acceptance test' },
          { 'if-match': String(version) },
        );
      const details = async () => body(await get(context, `cohorts/${cohortId}`));
      expect(await body(await command('plan'), 201)).toMatchObject({
        status: 'PLANNED',
        startsOn: null,
        endsOn: null,
      });
      version += 1;
      const alias = await body(
        await post(context, 'cohorts', {
          programVersionId: catalog.programVersionId,
          owningBranchId: context.branchId,
          code: String(created.code).replaceAll('-', ''),
          capacity: 1,
        }),
        201,
      );
      await body(
        await post(
          context,
          `cohorts/${alias.id}/plan`,
          { reason: 'Separate imported alias group' },
          { 'if-match': '1' },
        ),
        201,
      );
      await seedIntakeEnrollment(context, { ...catalog, cohortId: String(alias.id) }, 'ACTIVE');
      const first = await seedIntakeEnrollment(context, { ...catalog, cohortId });
      const second = await seedIntakeEnrollment(context, { ...catalog, cohortId });
      await body(
        await post(context, `enrollments/${first}/submit`, undefined, { 'if-match': '1' }),
        201,
      );
      expect(await details()).toMatchObject({
        confirmedEnrollmentCount: 0,
        learnerCount: 3,
        pendingEnrollmentCount: 2,
        remainingEnrollmentCount: 2,
        intakeStatus: 'COLLECTING',
      });
      expect(await body(await command('activate'), 409)).toMatchObject({
        code: 'COHORT_INTAKE_INCOMPLETE',
      });
      expect(
        await body(
          await post(context, `enrollments/${first}/activate`, {}, { 'if-match': '2' }),
          409,
        ),
      ).toMatchObject({ code: 'PRICING_NOT_APPROVED' });
      await seedApprovedFinance(context, first);
      await body(
        await post(context, `enrollments/${first}/activate`, {}, { 'if-match': '2' }),
        201,
      );
      expect(await details()).toMatchObject({
        confirmedEnrollmentCount: 1,
        pendingEnrollmentCount: 1,
        intakeStatus: 'COLLECTING',
      });
      await seedApprovedFinance(context, second);
      await body(
        await post(context, `enrollments/${second}/activate`, {}, { 'if-match': '1' }),
        201,
      );
      expect(await details()).toMatchObject({
        status: 'PLANNED',
        confirmedEnrollmentCount: 2,
        remainingEnrollmentCount: 0,
        intakeStatus: 'READY_TO_START',
      });

      expect(
        await body(
          await patch(
            context,
            `cohorts/${cohortId}`,
            { capacity: 1 },
            { 'if-match': String(version) },
          ),
          409,
        ),
      ).toMatchObject({ code: 'COHORT_CAPACITY_BELOW_RESERVED' });
      await body(
        await patch(
          context,
          `cohorts/${cohortId}`,
          { capacity: 3 },
          { 'if-match': String(version) },
        ),
      );
      version += 1;
      expect(await details()).toMatchObject({
        intakeStatus: 'COLLECTING',
        remainingEnrollmentCount: 1,
      });
      await body(
        await patch(
          context,
          `cohorts/${cohortId}`,
          { capacity: 2 },
          { 'if-match': String(version) },
        ),
      );
      version += 1;

      await body(
        await post(
          context,
          `enrollments/${second}/postpone`,
          { reason: 'Student requested postponement' },
          { 'if-match': '2' },
        ),
        201,
      );
      expect(await details()).toMatchObject({
        intakeStatus: 'COLLECTING',
        confirmedEnrollmentCount: 1,
        postponedEnrollmentCount: 1,
      });
      expect(await body(await command('activate'), 409)).toMatchObject({
        code: 'COHORT_INTAKE_INCOMPLETE',
      });
      await body(
        await post(
          context,
          `enrollments/${second}/resume`,
          { reason: 'Student reconfirmed attendance' },
          { 'if-match': '3' },
        ),
        201,
      );
      await body(
        await post(
          context,
          `enrollments/${second}/transfer`,
          { targetCohortId: catalog.cohortId, reason: 'Testing another intake group' },
          { 'if-match': '4' },
        ),
        201,
      );
      expect(await details()).toMatchObject({
        intakeStatus: 'COLLECTING',
        confirmedEnrollmentCount: 1,
      });
      await body(
        await post(
          context,
          `enrollments/${second}/transfer`,
          { targetCohortId: cohortId, reason: 'Returning to the original intake' },
          { 'if-match': '5' },
        ),
        201,
      );
      expect(await details()).toMatchObject({
        intakeStatus: 'READY_TO_START',
        confirmedEnrollmentCount: 2,
      });

      // Capacity remains a seat reservation limit, even though only confirmed seats complete intake.
      const person = await context.prisma.person.create({
        data: {
          organizationId: context.organizationId,
          publicId: `EXTRA-${randomUUID().slice(0, 8)}`,
          name: 'Extra synthetic applicant',
        },
      });
      await context.prisma.studentProfile.create({
        data: { organizationId: context.organizationId, personId: person.id },
      });
      expect(
        await body(
          await post(context, 'enrollments', {
            studentPersonId: person.id,
            programVersionId: catalog.programVersionId,
            cohortId,
            homeBranchId: context.branchId,
            kind: 'INDIVIDUAL',
          }),
          409,
        ),
      ).toMatchObject({ code: 'COHORT_CAPACITY_REACHED' });

      await runIntakeCancellationStep(context, {
        cohortId,
        first,
        replacementPersonId: person.id,
        programVersionId: catalog.programVersionId,
        version,
      });

      expect(await body(await command('activate'), 409)).toMatchObject({
        code: 'COHORT_DATES_REQUIRED',
      });
      await body(
        await patch(
          context,
          `cohorts/${cohortId}`,
          {
            startsOn: new Date().toISOString().slice(0, 10),
            endsOn: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
          },
          { 'if-match': String(version) },
        ),
      );
      version += 1;
      expect(await body(await command('activate'), 409)).toMatchObject({
        code: 'COHORT_SESSIONS_REQUIRED',
      });
      const detail = await details();
      const session = await body(
        await post(
          context,
          'sessions',
          {
            cohortId,
            cohortModuleId: detail.modules?.[0]?.id,
            ordinal: 1,
            deliveryMode: 'IN_PERSON',
            roomId: catalog.roomId,
            trainers: [{ trainerId: catalog.trainerId, role: 'PRIMARY' }],
            startsAt: new Date(Date.now() + 86400000).toISOString(),
            endsAt: new Date(Date.now() + 90000000).toISOString(),
          },
          { 'idempotency-key': `intake-session-${randomUUID()}` },
        ),
        201,
      );
      expect(
        await body(
          await post(context, `sessions/${session.id}/attendance-window/open`, undefined, {
            'if-match': '1',
          }),
          409,
        ),
      ).toMatchObject({ code: 'COHORT_NOT_STARTED' });
      expect(await body(await command('activate'), 201)).toMatchObject({ status: 'ACTIVE' });
      expect(await details()).toMatchObject({ intakeStatus: 'ACTIVE', status: 'ACTIVE' });
      expect(await body(await command('activate'), 409)).toMatchObject({
        code: 'VERSION_CONFLICT',
      });
    });
  }, 120_000);
});
