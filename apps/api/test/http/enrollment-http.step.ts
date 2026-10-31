import assert from 'node:assert/strict';
import { seedApprovedFinance, type BusinessFixture } from './business-chain-fixture';
import type { HttpTestContext } from './http-test-harness';

export async function runEnrollmentStep(
  context: HttpTestContext,
  fixture: BusinessFixture,
): Promise<string> {
  const createBody = {
    studentPersonId: fixture.studentPersonId,
    programVersionId: fixture.programVersionId,
    homeBranchId: context.branchId,
    cohortId: fixture.cohortId,
    kind: 'INDIVIDUAL',
  };
  const missingCsrf = await fetch(`${context.baseUrl}/api/v1/enrollments`, {
    method: 'POST',
    headers: {
      ...context.safeHeaders,
      origin: context.unsafeHeaders.origin,
      'content-type': 'application/json',
    },
    body: JSON.stringify(createBody),
  });
  assert.equal(missingCsrf.status, 403);
  assert.equal(((await missingCsrf.json()) as { code: string }).code, 'CSRF_TOKEN_INVALID');

  const foreign = await post(context, '/api/v1/enrollments', {
    ...createBody,
    studentPersonId: fixture.foreignStudentPersonId,
  });
  assert.equal(foreign.status, 404);
  assert.equal(((await foreign.json()) as { code: string }).code, 'STUDENT_NOT_FOUND');

  const createdResponse = await post(context, '/api/v1/enrollments', {
    ...createBody,
  });
  assert.equal(createdResponse.status, 201, await createdResponse.clone().text());
  const created = (await createdResponse.json()) as { id: string; state: string; version: number };
  assert.equal(created.state, 'DRAFT');
  assert.equal(created.version, 1);

  const stale = await post(context, `/api/v1/enrollments/${created.id}/submit`, undefined, {
    'if-match': '99',
  });
  assert.equal(stale.status, 409);
  assert.equal(((await stale.json()) as { code: string }).code, 'VERSION_CONFLICT');

  const submittedResponse = await post(
    context,
    `/api/v1/enrollments/${created.id}/submit`,
    undefined,
    { 'if-match': '1' },
  );
  assert.equal(submittedResponse.status, 201, await submittedResponse.clone().text());
  const submitted = (await submittedResponse.json()) as { state: string; version: number };
  assert.deepEqual(submitted, { id: created.id, state: 'PENDING_APPROVAL', version: 2 });

  await seedApprovedFinance(context, created.id);
  const activatedResponse = await post(
    context,
    `/api/v1/enrollments/${created.id}/activate`,
    { note: 'Approved for HTTP business scenario' },
    { 'if-match': '2' },
  );
  assert.equal(activatedResponse.status, 201, await activatedResponse.clone().text());
  const activated = (await activatedResponse.json()) as { state: string; version: number };
  assert.equal(activated.state, 'ACTIVE');
  assert.equal(activated.version, 3);
  const duplicateActivation = await post(
    context,
    `/api/v1/enrollments/${created.id}/activate`,
    { note: 'Duplicate activation must not mutate state' },
    { 'if-match': '2' },
  );
  assert.equal(duplicateActivation.status, 409);
  assert.equal(
    ((await duplicateActivation.json()) as { code: string }).code,
    'ENROLLMENT_TRANSITION_INVALID',
  );

  const read = await fetch(`${context.baseUrl}/api/v1/enrollments/${created.id}`, {
    headers: context.safeHeaders,
  });
  assert.equal(read.status, 200);
  assert.equal(((await read.json()) as { state: string }).state, 'ACTIVE');

  const list = await fetch(`${context.baseUrl}/api/v1/enrollments?state=ACTIVE`, {
    headers: context.safeHeaders,
  });
  assert.equal(list.status, 200);
  const listed = (await list.json()) as { items: Array<{ id: string }> };
  assert.equal(
    listed.items.some(({ id }) => id === created.id),
    true,
  );

  const stored = await context.prisma.enrollment.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(stored.state, 'ACTIVE');
  assert.equal(await context.prisma.ledgerEntry.count({ where: { enrollmentId: created.id } }), 1);
  return created.id;
}

async function post(
  context: HttpTestContext,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${context.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      ...context.unsafeHeaders,
      ...headers,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
