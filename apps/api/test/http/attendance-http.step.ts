import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { BusinessFixture } from './business-chain-fixture';
import type { HttpTestContext } from './http-test-harness';

export async function runAttendanceStep(
  context: HttpTestContext,
  fixture: BusinessFixture,
  enrollmentId: string,
): Promise<void> {
  const startsAt = new Date(Date.now() + 5 * 60_000);
  await context.prisma.attendancePolicyVersion.create({
    data: {
      organizationId: context.organizationId,
      programVersionId: fixture.programVersionId,
      version: 1,
      minimumRatio: '0.8000',
      lockAfterMinutes: 1440,
      checkInOpensBeforeMinutes: 30,
      checkInClosesAfterMinutes: 30,
      effectiveFrom: new Date(Date.now() - 86_400_000),
      createdBy: context.userId,
    },
  });
  const session = await context.prisma.session.create({
    data: {
      organizationId: context.organizationId,
      cohortModuleId: fixture.cohortModuleId,
      cohortId: fixture.cohortId,
      ordinal: 1,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60_000),
      deliveryMode: 'IN_PERSON',
      status: 'SCHEDULED',
    },
  });

  const opened = await post(context, `sessions/${session.id}/attendance-window/open`, undefined, {
    'if-match': '1',
  });
  assert.equal(opened.status, 201, await opened.clone().text());
  assert.deepEqual(await opened.json(), { id: session.id, state: 'OPEN', version: 2 });

  const manualKey = `manual-${randomUUID()}`;
  const manualBody = {
    enrollmentId,
    status: 'PRESENT',
    reason: 'Verified by HTTP integration scenario',
  };
  const manual = await post(context, `sessions/${session.id}/attendance/manual`, manualBody, {
    'idempotency-key': manualKey,
  });
  assert.equal(manual.status, 201, await manual.clone().text());
  const marked = (await manual.json()) as { id: string; status: string; version: number };
  assert.equal(marked.status, 'PRESENT');
  assert.equal(marked.version, 1);
  const manualReplay = await post(context, `sessions/${session.id}/attendance/manual`, manualBody, {
    'idempotency-key': manualKey,
  });
  assert.equal(manualReplay.status, 201);
  assert.deepEqual(await manualReplay.json(), marked);

  const closeKey = `close-${randomUUID()}`;
  const closed = await post(context, `sessions/${session.id}/attendance-window/close`, undefined, {
    'if-match': '2',
    'idempotency-key': closeKey,
  });
  assert.equal(closed.status, 200, await closed.clone().text());
  const closeResult = (await closed.json()) as {
    state: string;
    version: number;
    rosterCount: number;
    absentCount: number;
  };
  assert.deepEqual(closeResult, {
    id: session.id,
    state: 'LOCKED',
    version: 3,
    rosterCount: 2,
    absentCount: 1,
  });
  const closeReplay = await post(
    context,
    `sessions/${session.id}/attendance-window/close`,
    undefined,
    { 'if-match': '2', 'idempotency-key': closeKey },
  );
  assert.equal(closeReplay.status, 200);
  assert.deepEqual(await closeReplay.json(), closeResult);

  const absent = await context.prisma.attendanceRecord.findFirstOrThrow({
    where: { sessionId: session.id, enrollmentId: fixture.secondEnrollmentId },
  });
  assert.equal(absent.currentStatus, 'ABSENT');
  assert.equal(absent.source, 'SYSTEM_CLOSE');
  const correctionKey = `correct-${randomUUID()}`;
  const corrected = await post(
    context,
    `attendance/${absent.id}/corrections`,
    { status: 'EXCUSED', reason: 'Approved documented excuse' },
    { 'if-match': '1', 'idempotency-key': correctionKey },
  );
  assert.equal(corrected.status, 201, await corrected.clone().text());
  const correction = (await corrected.json()) as { status: string; version: number };
  assert.equal(correction.status, 'EXCUSED');
  assert.equal(correction.version, 2);
  const correctionReplay = await post(
    context,
    `attendance/${absent.id}/corrections`,
    { status: 'EXCUSED', reason: 'Approved documented excuse' },
    { 'if-match': '1', 'idempotency-key': correctionKey },
  );
  assert.equal(correctionReplay.status, 201);
  assert.deepEqual(await correctionReplay.json(), correction);

  await assertReadEndpoints(context, session.id, marked.id, enrollmentId);
}

async function assertReadEndpoints(
  context: HttpTestContext,
  sessionId: string,
  recordId: string,
  enrollmentId: string,
): Promise<void> {
  const roster = await fetch(`${context.baseUrl}/api/v1/sessions/${sessionId}/attendance`, {
    headers: context.safeHeaders,
  });
  assert.equal(roster.status, 200);
  assert.equal(((await roster.json()) as { items: unknown[] }).items.length, 2);
  const record = await fetch(`${context.baseUrl}/api/v1/attendance/${recordId}`, {
    headers: context.safeHeaders,
  });
  assert.equal(record.status, 200);
  assert.equal(((await record.json()) as { id: string }).id, recordId);
  const summary = await fetch(
    `${context.baseUrl}/api/v1/enrollments/${enrollmentId}/attendance-summary`,
    { headers: context.safeHeaders },
  );
  assert.equal(summary.status, 200);
  const body = (await summary.json()) as { ratio: string; denominator: number };
  assert.equal(body.denominator, 1);
  assert.equal(body.ratio, '1.0000');
}

async function post(
  context: HttpTestContext,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${context.baseUrl}/api/v1/${path}`, {
    method: 'POST',
    headers: {
      ...context.unsafeHeaders,
      ...headers,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
