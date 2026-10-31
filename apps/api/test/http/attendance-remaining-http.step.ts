import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { BusinessFixture } from './business-chain-fixture';
import { get, post } from './finance-http-client';
import { issueHttpSession, type HttpTestContext } from './http-test-harness';

export async function runAttendanceRemainingStep(
  context: HttpTestContext,
  fixture: BusinessFixture,
  enrollmentId: string,
): Promise<void> {
  await exercisePolicies(context, fixture);
  const studentHeaders = await seedStudentSession(context, fixture.studentPersonId);

  const selfTokenResponse = await fetch(`${context.baseUrl}/api/v1/attendance/self-token`, {
    headers: studentHeaders.safeHeaders,
  });
  assert.equal(selfTokenResponse.status, 200, await selfTokenResponse.clone().text());
  const stableToken = ((await selfTokenResponse.json()) as { token: string }).token;
  assert.equal(stableToken.length > 20, true);

  const challengeSession = await seedOpenSession(context, fixture, 20);
  const challengeResponse = await post(context, `sessions/${challengeSession.id}/qr-challenges`);
  assert.equal(challengeResponse.status, 201, await challengeResponse.clone().text());
  const challenge = (await challengeResponse.json()) as { token: string; expiresAt: string };
  assert.equal(Date.parse(challenge.expiresAt) > Date.now(), true);
  const checkedIn = await fetch(`${context.baseUrl}/api/v1/attendance/check-in`, {
    method: 'POST',
    headers: {
      ...studentHeaders.unsafeHeaders,
      'content-type': 'application/json',
      'idempotency-key': `self-check-in-${randomUUID()}`,
    },
    body: JSON.stringify({ token: challenge.token }),
  });
  assert.equal(checkedIn.status, 201, await checkedIn.clone().text());
  assert.equal(((await checkedIn.json()) as { status: string }).status, 'PRESENT');

  const scanSession = await seedOpenSession(context, fixture, 21);
  const scanKey = `scan-${randomUUID()}`;
  const scanned = await post(
    context,
    `sessions/${scanSession.id}/attendance/scan`,
    { token: stableToken, status: 'LATE' },
    { 'idempotency-key': scanKey },
  );
  assert.equal(scanned.status, 200, await scanned.clone().text());
  const scanBody = (await scanned.json()) as { id: string; status: string; version: number };
  assert.equal(scanBody.status, 'LATE');
  const replay = await post(
    context,
    `sessions/${scanSession.id}/attendance/scan`,
    { token: stableToken, status: 'LATE' },
    { 'idempotency-key': scanKey },
  );
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), scanBody);

  const anomalies = await get(
    context,
    `sessions/${challengeSession.id}/attendance-anomalies?limit=25`,
  );
  assert.equal(anomalies.status, 200, await anomalies.clone().text());
  assert.deepEqual((await anomalies.json()) as { items: unknown[] }, {
    items: [],
    nextCursor: null,
  });
  await exerciseMakeup(context, fixture, enrollmentId);
}

async function exercisePolicies(context: HttpTestContext, fixture: BusinessFixture): Promise<void> {
  const effectiveFrom = new Date(Date.now() + 86_400_000).toISOString();
  const key = `attendance-policy-${randomUUID()}`;
  const body = {
    programVersionId: fixture.programVersionId,
    cohortId: fixture.cohortId,
    minimumRatio: 0.85,
    lockAfterMinutes: 1440,
    checkInOpensBeforeMinutes: 30,
    checkInClosesAfterMinutes: 30,
    effectiveFrom,
  };
  const created = await post(context, 'attendance-policies', body, { 'idempotency-key': key });
  assert.equal(created.status, 201, await created.clone().text());
  const createdBody = (await created.json()) as { id: string; version: number };
  assert.equal(createdBody.version, 1);
  const replay = await post(context, 'attendance-policies', body, { 'idempotency-key': key });
  assert.equal(replay.status, 201);
  assert.deepEqual(await replay.json(), createdBody);
  const listed = await get(
    context,
    `attendance-policies?programVersionId=${fixture.programVersionId}&cohortId=${fixture.cohortId}`,
  );
  assert.equal(listed.status, 200, await listed.clone().text());
  assert.equal(
    ((await listed.json()) as { items: Array<{ id: string }> }).items.some(
      ({ id }) => id === createdBody.id,
    ),
    true,
  );
}

async function seedStudentSession(context: HttpTestContext, personId: string) {
  const user = await context.prisma.user.create({
    data: { organizationId: context.organizationId, personId, status: 'ACTIVE' },
  });
  const role = await context.prisma.role.create({
    data: {
      organizationId: context.organizationId,
      code: 'STUDENT',
      name: 'Student',
      isSystem: true,
    },
  });
  await context.prisma.rolePermissionGrant.create({
    data: {
      organizationId: context.organizationId,
      roleId: role.id,
      permissionCode: 'attendance.check_in_self',
      scope: 'O',
    },
  });
  await context.prisma.userRoleAssignment.create({
    data: { organizationId: context.organizationId, userId: user.id, roleId: role.id },
  });
  return issueHttpSession(context, user.id, false);
}

async function seedOpenSession(
  context: HttpTestContext,
  fixture: BusinessFixture,
  ordinal: number,
) {
  const startsAt = new Date();
  return context.prisma.session.create({
    data: {
      organizationId: context.organizationId,
      cohortModuleId: fixture.cohortModuleId,
      cohortId: fixture.cohortId,
      ordinal,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60_000),
      deliveryMode: 'IN_PERSON',
      status: 'SCHEDULED',
      attendanceWindowState: 'OPEN',
    },
  });
}

async function exerciseMakeup(
  context: HttpTestContext,
  fixture: BusinessFixture,
  enrollmentId: string,
): Promise<void> {
  const missedSession = await seedOpenSession(context, fixture, 22);
  const makeupSession = await seedOpenSession(context, fixture, 23);
  const [missed, attended] = await Promise.all([
    context.prisma.attendanceRecord.create({
      data: {
        organizationId: context.organizationId,
        sessionId: missedSession.id,
        enrollmentId,
        currentStatus: 'ABSENT',
        source: 'MANUAL',
        recordedAt: new Date(),
        recordedBy: context.userId,
      },
    }),
    context.prisma.attendanceRecord.create({
      data: {
        organizationId: context.organizationId,
        sessionId: makeupSession.id,
        enrollmentId,
        currentStatus: 'PRESENT',
        source: 'MANUAL',
        recordedAt: new Date(),
        recordedBy: context.userId,
      },
    }),
  ]);
  const key = `makeup-${randomUUID()}`;
  const response = await post(
    context,
    'attendance/makeup-credits',
    { missedRecordId: missed.id, makeupRecordId: attended.id },
    { 'idempotency-key': key },
  );
  assert.equal(response.status, 201, await response.clone().text());
  const result = (await response.json()) as { id: string };
  assert.equal(
    await context.prisma.makeupCredit.count({
      where: { organizationId: context.organizationId, id: result.id },
    }),
    1,
  );
}
