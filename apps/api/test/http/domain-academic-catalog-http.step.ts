import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { get, patch, post, put } from './finance-http-client';
import type { HttpTestContext } from './http-test-harness';
export type AcademicDomainFixture = {
  programId: string;
  programVersionId: string;
  moduleId: string;
  cohortId: string;
  cohortModuleId: string;
  roomId: string;
  trainerId: string;
};
export async function runAcademicCatalogHttpStep(
  context: HttpTestContext,
): Promise<AcademicDomainFixture> {
  const suffix = randomUUID().slice(0, 8);
  const moduleResponse = await post(context, 'modules', {
    code: `MOD-${suffix}`,
    name: 'Domain HTTP module',
  });
  assert.equal(moduleResponse.status, 201, await moduleResponse.clone().text());
  const module = (await moduleResponse.json()) as {
    id: string;
    version: number;
  };
  const moduleUpdate = await patch(
    context,
    `modules/${module.id}`,
    { name: 'Updated domain HTTP module' },
    { 'if-match': '1' },
  );
  assert.equal(moduleUpdate.status, 200, await moduleUpdate.clone().text());
  assert.equal(
    (
      (await moduleUpdate.json()) as {
        version: number;
      }
    ).version,
    2,
  );
  await expectOk(context, 'modules?search=Updated');
  const programResponse = await post(context, 'programs', {
    code: `PRG-${suffix}`,
    name: 'Domain HTTP program',
  });
  assert.equal(programResponse.status, 201, await programResponse.clone().text());
  const program = (await programResponse.json()) as {
    id: string;
    version: number;
  };
  const stale = await patch(
    context,
    `programs/${program.id}`,
    { name: 'Must not persist' },
    { 'if-match': '99' },
  );
  assert.equal(stale.status, 409);
  assert.equal(code(await stale.json()), 'VERSION_CONFLICT');
  const updatedProgram = await patch(
    context,
    `programs/${program.id}`,
    { name: 'Updated domain HTTP program' },
    { 'if-match': '1' },
  );
  assert.equal(updatedProgram.status, 200, await updatedProgram.clone().text());
  await expectOk(context, 'programs?search=Updated');
  await expectOk(context, `programs/${program.id}`);
  const versionResponse = await post(context, `programs/${program.id}/versions`, {
    modules: [{ moduleId: module.id, ordinal: 1, required: true }],
  });
  assert.equal(versionResponse.status, 201, await versionResponse.clone().text());
  const version = (await versionResponse.json()) as {
    id: string;
    recordVersion: number;
  };
  const curriculum = await put(
    context,
    `program-versions/${version.id}/curriculum`,
    { modules: [{ moduleId: module.id, ordinal: 1, required: true }] },
    { 'if-match': '1' },
  );
  assert.equal(curriculum.status, 200, await curriculum.clone().text());
  assert.equal(
    (
      (await curriculum.json()) as {
        recordVersion: number;
      }
    ).recordVersion,
    2,
  );
  const published = await post(
    context,
    `program-versions/${version.id}/publish`,
    { effectiveFrom: dateOffset(-1) },
    { 'if-match': '2' },
  );
  assert.equal(published.status, 201, await published.clone().text());
  assert.equal(
    (
      (await published.json()) as {
        status: string;
      }
    ).status,
    'PUBLISHED',
  );
  await expectOk(context, `program-versions/${version.id}`);
  const cohortResponse = await post(context, 'cohorts', {
    programVersionId: version.id,
    owningBranchId: context.branchId,
    code: `COH-${suffix}`,
    name: 'Domain HTTP cohort',
    startsOn: dateOffset(-1),
    endsOn: dateOffset(60),
    capacity: 25,
  });
  assert.equal(cohortResponse.status, 201, await cohortResponse.clone().text());
  const cohort = (await cohortResponse.json()) as {
    id: string;
    version: number;
  };
  const cohortUpdate = await patch(
    context,
    `cohorts/${cohort.id}`,
    { name: 'Updated domain cohort', capacity: 2 },
    { 'if-match': '1' },
  );
  assert.equal(cohortUpdate.status, 200, await cohortUpdate.clone().text());
  const planned = await post(
    context,
    `cohorts/${cohort.id}/plan`,
    { reason: 'Calendar and curriculum ready' },
    { 'if-match': '2' },
  );
  assert.equal(planned.status, 201, await planned.clone().text());
  assert.equal(
    (
      (await planned.json()) as {
        status: string;
      }
    ).status,
    'PLANNED',
  );
  await expectOk(context, `cohorts?branchId=${context.branchId}`);
  const cohortDetail = await get(context, `cohorts/${cohort.id}`);
  assert.equal(cohortDetail.status, 200);
  const cohortBody = (await cohortDetail.json()) as {
    modules: Array<{
      id: string;
    }>;
  };
  assert.equal(cohortBody.modules.length, 1);
  const roomResponse = await post(context, 'rooms', {
    branchId: context.branchId,
    code: `RM-${suffix}`,
    name: 'Domain HTTP room',
    capacity: 35,
  });
  assert.equal(roomResponse.status, 201, await roomResponse.clone().text());
  const room = (await roomResponse.json()) as {
    id: string;
  };
  const roomUpdated = await patch(
    context,
    `rooms/${room.id}`,
    { capacity: 40 },
    { 'if-match': '1' },
  );
  assert.equal(roomUpdated.status, 200, await roomUpdated.clone().text());
  await expectOk(context, `rooms?branchId=${context.branchId}`);
  const trainerResponse = await post(context, 'trainers', {
    name: 'Domain HTTP trainer',
    biographyEn: 'Experienced domain HTTP trainer',
  });
  assert.equal(trainerResponse.status, 201, await trainerResponse.clone().text());
  const trainer = (await trainerResponse.json()) as {
    id: string;
  };
  const trainerUpdated = await patch(
    context,
    `trainers/${trainer.id}`,
    { biographyEn: 'Updated trainer biography' },
    { 'if-match': '1' },
  );
  assert.equal(trainerUpdated.status, 200, await trainerUpdated.clone().text());
  await expectOk(context, 'trainers?search=Domain');
  await expectOk(context, `trainers/${trainer.id}`);
  await proveForeignProgramHidden(context);
  return {
    programId: program.id,
    programVersionId: version.id,
    moduleId: module.id,
    cohortId: cohort.id,
    cohortModuleId: cohortBody.modules[0]!.id,
    roomId: room.id,
    trainerId: trainer.id,
  };
}
export async function finishAcademicLifecycle(
  context: HttpTestContext,
  fixture: AcademicDomainFixture,
): Promise<void> {
  const completed = await post(
    context,
    `cohorts/${fixture.cohortId}/complete`,
    { reason: 'All planned domain work completed' },
    { 'if-match': '4' },
  );
  assert.equal(completed.status, 201, await completed.clone().text());
  assert.equal(
    (
      (await completed.json()) as {
        status: string;
      }
    ).status,
    'COMPLETED',
  );
  const archived = await post(
    context,
    `program-versions/${fixture.programVersionId}/archive`,
    { reason: 'Version lifecycle covered after conversion' },
    { 'if-match': '3' },
  );
  assert.equal(archived.status, 201, await archived.clone().text());
  assert.equal(
    (
      (await archived.json()) as {
        status: string;
      }
    ).status,
    'ARCHIVED',
  );
}
async function expectOk(context: HttpTestContext, path: string): Promise<void> {
  const response = await get(context, path);
  assert.equal(response.status, 200, `${path}: ${await response.clone().text()}`);
}
async function proveForeignProgramHidden(context: HttpTestContext): Promise<void> {
  const organization = await context.prisma.organization.create({
    data: {
      code: `CAT-X-${randomUUID().slice(0, 8)}`.toUpperCase(),
      name: 'Foreign catalog organization',
    },
  });
  const program = await context.prisma.program.create({
    data: {
      organizationId: organization.id,
      code: 'FOREIGN',
      name: 'Foreign program',
    },
  });
  const hidden = await get(context, `programs/${program.id}`);
  assert.equal(hidden.status, 404);
}
function dateOffset(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}
function code(value: unknown): string | undefined {
  return (
    value as {
      code?: string;
    }
  ).code;
}
