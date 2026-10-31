import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { seedApprovedFinance } from './business-chain-fixture';
import type { HttpTestContext } from './http-test-harness';

export async function intakeResponse(
  response: Response,
  status = 200,
): Promise<Record<string, unknown> & { id: string; modules?: Array<{ id: string }> }> {
  const value: unknown = await response.json();
  assert.equal(response.status, status, JSON.stringify(value));
  return value as Record<string, unknown> & { id: string; modules?: Array<{ id: string }> };
}

export async function seedIntakeEnrollment(
  context: HttpTestContext,
  cohort: { cohortId: string; programVersionId: string },
  state: 'DRAFT' | 'ACTIVE' = 'DRAFT',
) {
  const { prisma, organizationId, branchId, userId } = context;
  const person = await prisma.person.create({
    data: {
      organizationId,
      publicId: `INTAKE-${randomUUID().slice(0, 12)}`,
      name: 'Synthetic intake student',
    },
  });
  await prisma.studentProfile.create({ data: { organizationId, personId: person.id } });
  const billing = await prisma.billingAccount.create({
    data: { organizationId, kind: 'INDIVIDUAL', personId: person.id },
  });
  const enrollment = await prisma.enrollment.create({
    data: {
      organizationId,
      studentPersonId: person.id,
      programVersionId: cohort.programVersionId,
      billingAccountId: billing.id,
      homeBranchId: branchId,
    },
  });
  await prisma.enrollmentCohortAssignment.create({
    data: {
      organizationId,
      enrollmentId: enrollment.id,
      cohortId: cohort.cohortId,
      startsAt: new Date(),
      createdBy: userId,
    },
  });
  if (state === 'ACTIVE') {
    await seedApprovedFinance(context, enrollment.id);
    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { state, activatedAt: new Date() },
    });
  }
  return enrollment.id;
}
