import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AcademicDomainFixture } from './domain-academic-catalog-http.step';
import { get, post } from './finance-http-client';
import type { HttpTestContext } from './http-test-harness';
import { seedIntakeEnrollment } from './cohort-intake-fixture';

type SessionResult = { id: string; status: string; version: number };

export async function runAcademicSessionsHttpStep(
  context: HttpTestContext,
  fixture: AcademicDomainFixture,
): Promise<void> {
  const future = period(4, 5);
  const mainBody = sessionBody(fixture, 1, future);
  const createKey = `session-create-${randomUUID()}`;
  const mainResponse = await post(context, 'sessions', mainBody, {
    'idempotency-key': createKey,
  });
  assert.equal(mainResponse.status, 201, await mainResponse.clone().text());
  const main = (await mainResponse.json()) as SessionResult;
  assert.equal(main.status, 'SCHEDULED');
  const replay = await post(context, 'sessions', mainBody, { 'idempotency-key': createKey });
  assert.equal(replay.status, 201);
  assert.deepEqual(await replay.json(), main);

  const completedCandidate = await createSession(context, sessionBody(fixture, 2, period(-4, -3)));
  const cancelledCandidate = await createSession(context, sessionBody(fixture, 3, period(7, 8)));
  // Academic can start a filled group, but commercial approval is fixture setup, not its permission.
  await seedIntakeEnrollment(context, fixture, 'ACTIVE');
  const withdrawn = await seedIntakeEnrollment(context, fixture, 'ACTIVE');
  const activated = await post(
    context,
    `cohorts/${fixture.cohortId}/activate`,
    { reason: 'Scheduled sessions are ready' },
    { 'if-match': '3' },
  );
  assert.equal(activated.status, 201, await activated.clone().text());
  assert.equal(((await activated.json()) as { status: string }).status, 'ACTIVE');
  // A later withdrawal frees a seat for the lead conversion step without un-starting the group.
  await context.prisma.enrollment.update({
    where: { id: withdrawn },
    data: { state: 'CANCELLED', cancelledAt: new Date() },
  });
  await context.prisma.enrollmentCohortAssignment.updateMany({
    where: { organizationId: context.organizationId, enrollmentId: withdrawn, endsAt: null },
    data: { endsAt: new Date() },
  });

  const stale = await post(
    context,
    `sessions/${main.id}/reschedule`,
    { ...period(5, 6), roomId: fixture.roomId, reason: 'Stale request must fail' },
    { 'if-match': '99', 'idempotency-key': `session-stale-${randomUUID()}` },
  );
  assert.equal(stale.status, 409);
  assert.equal(((await stale.json()) as { code: string }).code, 'VERSION_CONFLICT');
  const rescheduleBody = {
    ...period(5, 6),
    roomId: fixture.roomId,
    reason: 'Trainer requested a controlled time change',
    trainers: [{ trainerId: fixture.trainerId, role: 'PRIMARY' }],
  };
  const rescheduleKey = `session-reschedule-${randomUUID()}`;
  const rescheduledResponse = await post(
    context,
    `sessions/${main.id}/reschedule`,
    rescheduleBody,
    { 'if-match': '1', 'idempotency-key': rescheduleKey },
  );
  assert.equal(rescheduledResponse.status, 201, await rescheduledResponse.clone().text());
  const rescheduled = (await rescheduledResponse.json()) as SessionResult;
  assert.equal(rescheduled.version, 2);
  const rescheduleReplay = await post(context, `sessions/${main.id}/reschedule`, rescheduleBody, {
    'if-match': '1',
    'idempotency-key': rescheduleKey,
  });
  assert.equal(rescheduleReplay.status, 201);
  assert.deepEqual(await rescheduleReplay.json(), rescheduled);

  const list = await get(context, `sessions?cohortId=${fixture.cohortId}&limit=10`);
  assert.equal(list.status, 200, await list.clone().text());
  assert.equal(((await list.json()) as { items: unknown[] }).items.length, 3);
  const detail = await get(context, `sessions/${main.id}`);
  assert.equal(detail.status, 200, await detail.clone().text());
  assert.equal(((await detail.json()) as { id: string }).id, main.id);
  const range = period(-24, 24);
  const calendar = await get(
    context,
    `calendar?from=${encodeURIComponent(range.startsAt)}&to=${encodeURIComponent(range.endsAt)}` +
      `&branchId=${context.branchId}`,
  );
  assert.equal(calendar.status, 200, await calendar.clone().text());
  assert.equal(((await calendar.json()) as { items: unknown[] }).items.length, 3);

  const completed = await post(
    context,
    `sessions/${completedCandidate.id}/complete`,
    { note: 'Past session completed by HTTP lifecycle' },
    { 'if-match': '1', 'idempotency-key': `session-complete-${randomUUID()}` },
  );
  assert.equal(completed.status, 201, await completed.clone().text());
  assert.equal(((await completed.json()) as SessionResult).status, 'COMPLETED');
  const cancelled = await post(
    context,
    `sessions/${cancelledCandidate.id}/cancel`,
    { reason: 'Controlled cancellation for HTTP lifecycle' },
    { 'if-match': '1', 'idempotency-key': `session-cancel-${randomUUID()}` },
  );
  assert.equal(cancelled.status, 201, await cancelled.clone().text());
  assert.equal(((await cancelled.json()) as SessionResult).status, 'CANCELLED');
  assert.equal(
    await context.prisma.session.count({
      where: { organizationId: context.organizationId, cohortId: fixture.cohortId },
    }),
    3,
  );
}

async function createSession(
  context: HttpTestContext,
  body: ReturnType<typeof sessionBody>,
): Promise<SessionResult> {
  const response = await post(context, 'sessions', body, {
    'idempotency-key': `session-create-${randomUUID()}`,
  });
  assert.equal(response.status, 201, await response.clone().text());
  return (await response.json()) as SessionResult;
}

function sessionBody(
  fixture: AcademicDomainFixture,
  ordinal: number,
  times: ReturnType<typeof period>,
) {
  return {
    cohortModuleId: fixture.cohortModuleId,
    cohortId: fixture.cohortId,
    roomId: fixture.roomId,
    ordinal,
    ...times,
    deliveryMode: 'IN_PERSON',
    trainers: [{ trainerId: fixture.trainerId, role: 'PRIMARY' }],
  };
}

function period(startHours: number, endHours: number) {
  return {
    startsAt: new Date(Date.now() + startHours * 3_600_000).toISOString(),
    endsAt: new Date(Date.now() + endHours * 3_600_000).toISOString(),
  };
}
