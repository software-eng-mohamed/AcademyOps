import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { BusinessFixture } from './business-chain-fixture';
import { post } from './finance-http-client';
import type { HttpTestContext } from './http-test-harness';

export async function runEnrollmentRemainingStep(
  context: HttpTestContext,
  fixture: BusinessFixture,
  enrollmentId: string,
): Promise<void> {
  const moduleLink = await context.prisma.programVersionModule.findFirstOrThrow({
    where: { organizationId: context.organizationId, programVersionId: fixture.programVersionId },
  });
  const targetCohort = await context.prisma.cohort.create({
    data: {
      organizationId: context.organizationId,
      programVersionId: fixture.programVersionId,
      owningBranchId: context.branchId,
      code: `TRANSFER-${randomUUID().slice(0, 8)}`,
      name: 'HTTP transfer target',
      capacity: 10,
    },
  });
  await context.prisma.cohort.update({
    where: { id: targetCohort.id },
    data: { status: 'PLANNED' },
  });

  const transferred = await post(
    context,
    `enrollments/${enrollmentId}/transfer`,
    { targetCohortId: targetCohort.id, reason: 'HTTP transfer lifecycle evidence' },
    { 'if-match': '3' },
  );
  assert.equal(transferred.status, 201, await transferred.clone().text());
  assert.equal(((await transferred.json()) as { version: number }).version, 4);
  await assertStateCommand(context, enrollmentId, 'postpone', 4, 'POSTPONED', 5);
  await assertStateCommand(context, enrollmentId, 'resume', 5, 'ACTIVE', 6);

  const cancellation = await post(
    context,
    `enrollments/${enrollmentId}/cancellation-requests`,
    { reason: 'Student requested controlled cancellation review' },
    { 'if-match': '6', 'idempotency-key': `cancel-request-${randomUUID()}` },
  );
  assert.equal(cancellation.status, 201, await cancellation.clone().text());
  assert.equal(((await cancellation.json()) as { status: string }).status, 'REQUESTED');

  const retakeResponse = await post(context, `enrollments/${enrollmentId}/retakes`, {
    programVersionModuleId: moduleLink.id,
    reason: 'HTTP retake lifecycle evidence',
  });
  assert.equal(retakeResponse.status, 201, await retakeResponse.clone().text());
  const retake = (await retakeResponse.json()) as { id: string; version: number };
  const approvedRetake = await post(
    context,
    `module-retakes/${retake.id}/approve`,
    { reason: 'Academic approval verified' },
    { 'if-match': String(retake.version) },
  );
  assert.equal(approvedRetake.status, 201, await approvedRetake.clone().text());
  assert.equal(((await approvedRetake.json()) as { status: string }).status, 'APPROVED');
  const rejectedSeed = await context.prisma.moduleRetake.create({
    data: {
      organizationId: context.organizationId,
      enrollmentId,
      programVersionModuleId: moduleLink.id,
      reason: 'Second retake decision branch',
      requestedBy: context.userId,
    },
  });
  const rejectedRetake = await post(
    context,
    `module-retakes/${rejectedSeed.id}/reject`,
    { reason: 'Academic rejection verified' },
    { 'if-match': '1' },
  );
  assert.equal(rejectedRetake.status, 201, await rejectedRetake.clone().text());
  assert.equal(((await rejectedRetake.json()) as { status: string }).status, 'REJECTED');

  await exerciseRejectAndCancellationDecisions(context, fixture);
  await assertStateCommand(context, enrollmentId, 'complete', 6, 'COMPLETED', 7);
  const stored = await context.prisma.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } });
  assert.equal(stored.state, 'COMPLETED');
  assert.equal(stored.version, 7);
}

async function exerciseRejectAndCancellationDecisions(
  context: HttpTestContext,
  fixture: BusinessFixture,
): Promise<void> {
  const pending = await seedEnrollment(context, fixture, 'PENDING_APPROVAL');
  const rejected = await post(
    context,
    `enrollments/${pending.id}/reject`,
    { reason: 'Pricing approval evidence was incomplete' },
    { 'if-match': '1' },
  );
  assert.equal(rejected.status, 201, await rejected.clone().text());
  assert.equal(((await rejected.json()) as { state: string }).state, 'DRAFT');

  const maker = await context.prisma.person.create({
    data: {
      organizationId: context.organizationId,
      publicId: `MAKER-${randomUUID().slice(0, 12)}`,
      name: 'Cancellation maker',
    },
  });
  const makerUser = await context.prisma.user.create({
    data: { organizationId: context.organizationId, personId: maker.id, status: 'ACTIVE' },
  });
  for (const decision of ['approve', 'reject'] as const) {
    const enrollment = await seedEnrollment(context, fixture, 'ACTIVE');
    const request = await context.prisma.enrollmentCancellationRequest.create({
      data: {
        organizationId: context.organizationId,
        enrollmentId: enrollment.id,
        enrollmentVersion: enrollment.version,
        reason: `HTTP cancellation ${decision} branch`,
        requestedBy: makerUser.id,
      },
    });
    const response = await post(
      context,
      `enrollment-cancellation-requests/${request.id}/${decision}`,
      { reason: `Owner ${decision} decision evidence` },
      { 'idempotency-key': `cancel-${decision}-${randomUUID()}` },
    );
    assert.equal(response.status, 201, await response.clone().text());
    assert.equal(
      ((await response.json()) as { status: string }).status,
      decision === 'approve' ? 'APPROVED' : 'REJECTED',
    );
  }
}

async function seedEnrollment(
  context: HttpTestContext,
  fixture: BusinessFixture,
  state: 'ACTIVE' | 'PENDING_APPROVAL',
) {
  const person = await context.prisma.person.create({
    data: {
      organizationId: context.organizationId,
      publicId: `LIFE-${randomUUID().slice(0, 13)}`,
      name: 'Lifecycle student',
    },
  });
  await context.prisma.studentProfile.create({
    data: { organizationId: context.organizationId, personId: person.id },
  });
  const billing = await context.prisma.billingAccount.create({
    data: { organizationId: context.organizationId, kind: 'INDIVIDUAL', personId: person.id },
  });
  const enrollment = await context.prisma.enrollment.create({
    data: {
      organizationId: context.organizationId,
      studentPersonId: person.id,
      programVersionId: fixture.programVersionId,
      billingAccountId: billing.id,
      homeBranchId: context.branchId,
      state,
      ...(state === 'ACTIVE' ? { activatedAt: new Date(Date.now() - 86_400_000) } : {}),
    },
  });
  await context.prisma.enrollmentCohortAssignment.create({
    data: {
      organizationId: context.organizationId,
      enrollmentId: enrollment.id,
      cohortId: fixture.cohortId,
      startsAt: new Date(Date.now() - 86_400_000),
      createdBy: context.userId,
    },
  });
  return enrollment;
}

async function assertStateCommand(
  context: HttpTestContext,
  enrollmentId: string,
  command: 'postpone' | 'resume' | 'complete',
  version: number,
  state: string,
  nextVersion: number,
): Promise<void> {
  const response = await post(
    context,
    `enrollments/${enrollmentId}/${command}`,
    { reason: `HTTP ${command} lifecycle evidence` },
    { 'if-match': String(version) },
  );
  assert.equal(response.status, 201, await response.clone().text());
  assert.deepEqual(await response.json(), { id: enrollmentId, state, version: nextVersion });
}
