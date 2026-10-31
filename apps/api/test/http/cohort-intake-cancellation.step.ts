import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { seedApprovedFinance } from './business-chain-fixture';
import { intakeResponse as body } from './cohort-intake-fixture';
import { get, post } from './finance-http-client';
import { issueHttpSession, type HttpTestContext } from './http-test-harness';

export async function runIntakeCancellationStep(
  context: HttpTestContext,
  input: {
    cohortId: string;
    first: string;
    replacementPersonId: string;
    programVersionId: string;
    version: number;
  },
) {
  const { cohortId, first, version } = input;
  const details = async () => body(await get(context, `cohorts/${cohortId}`));
  const command = (name: string) =>
    post(
      context,
      `cohorts/${cohortId}/${name}`,
      { reason: 'Confirmed intake acceptance test' },
      { 'if-match': String(version) },
    );
  const cancellation = await body(
    await post(
      context,
      `enrollments/${first}/cancellation-requests`,
      { reason: 'Student withdrew before group start' },
      { 'if-match': '3', 'idempotency-key': `intake-cancel-${randomUUID()}` },
    ),
    201,
  );
  // A request alone does not remove a confirmed enrollment; a separate authorized reviewer must approve it.
  expect(await details()).toMatchObject({
    confirmedEnrollmentCount: 2,
    intakeStatus: 'READY_TO_START',
  });
  const reviewerPerson = await context.prisma.person.create({
    data: {
      organizationId: context.organizationId,
      publicId: `REVIEW-${randomUUID().slice(0, 8)}`,
      name: 'Synthetic cancellation reviewer',
    },
  });
  const reviewerUser = await context.prisma.user.create({
    data: {
      organizationId: context.organizationId,
      personId: reviewerPerson.id,
      status: 'ACTIVE',
    },
  });
  const role = await context.prisma.userRoleAssignment.findFirstOrThrow({
    where: { userId: context.userId },
  });
  await context.prisma.userRoleAssignment.create({
    data: {
      organizationId: context.organizationId,
      userId: reviewerUser.id,
      roleId: role.roleId,
    },
  });
  const reviewer = {
    ...context,
    ...(await issueHttpSession(context, reviewerUser.id)),
    userId: reviewerUser.id,
    personId: reviewerPerson.id,
  };
  await body(
    await post(
      reviewer,
      `enrollment-cancellation-requests/${cancellation.id}/approve`,
      { reason: 'Verified student withdrawal request' },
      { 'idempotency-key': `intake-approve-${randomUUID()}` },
    ),
    201,
  );
  expect(await details()).toMatchObject({
    confirmedEnrollmentCount: 1,
    remainingEnrollmentCount: 1,
    intakeStatus: 'COLLECTING',
  });
  expect(await body(await command('activate'), 409)).toMatchObject({
    code: 'COHORT_INTAKE_INCOMPLETE',
  });
  const replacement = await body(
    await post(context, 'enrollments', {
      studentPersonId: input.replacementPersonId,
      programVersionId: input.programVersionId,
      cohortId,
      homeBranchId: context.branchId,
      kind: 'INDIVIDUAL',
    }),
    201,
  );
  await seedApprovedFinance(context, String(replacement.id));
  await body(
    await post(context, `enrollments/${replacement.id}/activate`, {}, { 'if-match': '1' }),
    201,
  );
  expect(await details()).toMatchObject({
    confirmedEnrollmentCount: 2,
    intakeStatus: 'READY_TO_START',
  });
}
