import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PermissionCode, EnrollmentCommand, EnrollmentState } from '@academyops/contracts';
import { DomainTransitionError, transitionEnrollment } from '@academyops/contracts';

export function enrollmentNotFound() {
  return new NotFoundException({
    code: 'ENROLLMENT_NOT_FOUND',
    messageKey: 'enrollments.notFound',
  });
}

export function billingInvalid() {
  return new ConflictException({
    code: 'BILLING_ACCOUNT_INVALID',
    messageKey: 'finance.billingAccountInvalid',
  });
}

export function versionConflict() {
  return new ConflictException({
    code: 'VERSION_CONFLICT',
    messageKey: 'errors.versionConflict',
  });
}

export function nextState(state: string, command: EnrollmentCommand): EnrollmentState {
  try {
    return transitionEnrollment(state as EnrollmentState, command);
  } catch (error) {
    if (error instanceof DomainTransitionError) {
      throw new ConflictException({
        code: 'ENROLLMENT_TRANSITION_INVALID',
        messageKey: 'enrollments.transitionInvalid',
      });
    }
    throw error;
  }
}

export function permissionForCommand(
  command: Exclude<EnrollmentCommand, 'activate'>,
): PermissionCode {
  const permissions: Record<Exclude<EnrollmentCommand, 'activate'>, PermissionCode> = {
    submit: 'enrollments.submit',
    reject: 'enrollments.activate',
    postpone: 'enrollments.postpone',
    resume: 'enrollments.resume',
    complete: 'enrollments.complete',
    cancel: 'enrollments.cancel.approve',
  };
  return permissions[command];
}

export async function assertCohortCapacity(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  cohortId: string,
) {
  const cohort = await transaction.cohort.findFirst({
    where: { organizationId, id: cohortId },
    select: { capacity: true },
  });
  if (!cohort) throw enrollmentNotFound();
  if (cohort.capacity === null) return;
  const activeCount = await transaction.enrollmentCohortAssignment.count({
    where: { organizationId, cohortId, endsAt: null },
  });
  if (activeCount >= cohort.capacity) {
    throw new ConflictException({
      code: 'COHORT_CAPACITY_REACHED',
      messageKey: 'enrollments.cohortCapacityReached',
    });
  }
}
