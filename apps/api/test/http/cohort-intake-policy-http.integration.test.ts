import { randomUUID } from 'node:crypto';
import { permissions } from '@academyops/contracts';
import { describe, expect, it } from 'vitest';
import { intakeResponse as body } from './cohort-intake-fixture';
import { runAcademicCatalogHttpStep } from './domain-academic-catalog-http.step';
import { patch, post } from './finance-http-client';
import { runHttpScenario } from './http-test-harness';

const databaseDescribe =
  process.env.DATABASE_URL && process.env.REDIS_URL ? describe : describe.skip;
databaseDescribe('Cohort intake target and access policy', () => {
  it('requires a target and rejects activation without management permission', async () => {
    await runHttpScenario(
      { permissions: ['academic.catalog.read'], roleCode: 'VIEWER' },
      async (context) => {
        expect(
          await body(
            await post(
              context,
              `cohorts/${randomUUID()}/activate`,
              { reason: 'Unauthorized start' },
              { 'if-match': '1' },
            ),
            403,
          ),
        ).toMatchObject({ code: 'PERMISSION_DENIED' });
      },
    );
    await runHttpScenario({ permissions: [...permissions], roleCode: 'OWNER' }, async (context) => {
      const catalog = await runAcademicCatalogHttpStep(context);
      expect(
        await body(
          await patch(
            context,
            `cohorts/${catalog.cohortId}`,
            { capacity: null },
            { 'if-match': '3' },
          ),
          409,
        ),
      ).toMatchObject({ code: 'COHORT_TARGET_REQUIRED' });
      const draft = await body(
        await post(context, 'cohorts', {
          programVersionId: catalog.programVersionId,
          owningBranchId: context.branchId,
          code: `NO-TARGET-${randomUUID().slice(0, 8)}`,
        }),
        201,
      );
      expect(
        await body(
          await post(
            context,
            `cohorts/${draft.id}/plan`,
            { reason: 'Missing target must not open' },
            { 'if-match': '1' },
          ),
          409,
        ),
      ).toMatchObject({ code: 'COHORT_TARGET_REQUIRED' });
    });
  }, 120_000);
});
