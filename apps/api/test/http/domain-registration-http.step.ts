import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { get, post } from './finance-http-client';
import type { HttpTestContext } from './http-test-harness';
export async function runStudentRegistrationHttpStep(context: HttpTestContext): Promise<void> {
  const organization = await context.prisma.organization.findUniqueOrThrow({
    where: { id: context.organizationId },
  });
  await context.prisma.role.create({
    data: {
      organizationId: context.organizationId,
      code: 'STUDENT',
      name: 'Student',
      isSystem: true,
    },
  });
  const approvedId = await register(context, organization.code, 'approve');
  const list = await get(context, 'student-registrations?status=PENDING&page=1&limit=10');
  assert.equal(list.status, 200, await list.clone().text());
  assert.equal(
    (
      (await list.json()) as {
        items: Array<{
          id: string;
        }>;
      }
    ).items.some(({ id }) => id === approvedId),
    true,
  );
  const detail = await get(context, `student-registrations/${approvedId}`);
  assert.equal(detail.status, 200, await detail.clone().text());
  assert.equal(
    (
      (await detail.json()) as {
        status: string;
      }
    ).status,
    'PENDING',
  );
  const missingProof = await post(
    context,
    `student-registrations/${approvedId}/approve`,
    undefined,
    { 'if-match': '1' },
  );
  assert.equal(missingProof.status, 400);
  const proof = approvalProof(approvedId);
  const stale = await post(context, `student-registrations/${approvedId}/approve`, proof, {
    'if-match': '99',
  });
  assert.equal(stale.status, 409);
  assert.equal(
    (
      (await stale.json()) as {
        code: string;
      }
    ).code,
    'VERSION_MISMATCH',
  );
  const approved = await post(context, `student-registrations/${approvedId}/approve`, proof, {
    'if-match': '1',
  });
  assert.equal(approved.status, 200, await approved.clone().text());
  assert.equal(
    (
      (await approved.json()) as {
        status: string;
      }
    ).status,
    'APPROVED',
  );
  const rejectedId = await register(context, organization.code, 'reject');
  const rejected = await post(
    context,
    `student-registrations/${rejectedId}/reject`,
    { reason: 'Submitted contact ownership could not be verified' },
    { 'if-match': '1' },
  );
  assert.equal(rejected.status, 200, await rejected.clone().text());
  assert.equal(
    (
      (await rejected.json()) as {
        status: string;
      }
    ).status,
    'REJECTED',
  );
  const stored = await context.prisma.studentRegistration.findMany({
    where: { organizationId: context.organizationId, id: { in: [approvedId, rejectedId] } },
  });
  assert.deepEqual(stored.map(({ status }) => status).sort(), ['APPROVED', 'REJECTED']);
}
function approvalProof(registrationId: string) {
  return {
    verificationMethod: 'IN_PERSON_EMAIL_OWNERSHIP',
    verificationReference: `REG-${registrationId}`,
  };
}
async function register(
  context: HttpTestContext,
  organizationCode: string,
  label: string,
): Promise<string> {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  const response = await fetch(`${context.baseUrl}/api/v1/student-registrations`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-correlation-id': `registration-${label}-${suffix}`,
    },
    body: JSON.stringify({
      organizationCode,
      name: `Registration ${label} ${suffix}`,
      email: `registration-${label}-${suffix}@example.test`,
      phone: randomEgyptPhone(),
      password: `Strong-${suffix}-Password!`,
      preferredLocale: 'en',
    }),
  });
  assert.equal(response.status, 202, await response.clone().text());
  const body = (await response.json()) as {
    id: string;
    status: string;
  };
  assert.equal(body.status, 'PENDING');
  assert.equal(
    await context.prisma.studentRegistration.count({
      where: { organizationId: context.organizationId, id: body.id },
    }),
    1,
  );
  return body.id;
}
function randomEgyptPhone(): string {
  return `011${Math.floor(10000000 + Math.random() * 89999999)}`;
}
