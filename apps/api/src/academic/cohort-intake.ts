import type { Prisma } from '@prisma/client';
import { catalogConflict } from './catalog-helper';

export function assertCohortTarget(capacity: number | null): asserts capacity is number {
  if (!capacity || capacity < 1)
    throw catalogConflict('COHORT_TARGET_REQUIRED', 'academic.cohortTargetRequired');
}

export async function assertCohortTargetChange(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  cohortId: string,
  capacity: number,
) {
  assertCohortTarget(capacity);
  const reserved = await transaction.enrollmentCohortAssignment.count({
    where: { organizationId, cohortId, endsAt: null },
  });
  if (capacity < reserved)
    throw catalogConflict('COHORT_CAPACITY_BELOW_RESERVED', 'academic.cohortCapacityBelowReserved');
}

export async function assertCohortCanStart(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  cohort: { id: string; capacity: number | null; startsOn: Date | null; endsOn: Date | null },
) {
  assertCohortTarget(cohort.capacity);
  const counts = await readCohortIntakeCounts(transaction, organizationId, [cohort.id]);
  if ((counts.get(cohort.id)?.confirmedEnrollmentCount ?? 0) < cohort.capacity)
    throw catalogConflict('COHORT_INTAKE_INCOMPLETE', 'academic.cohortIntakeIncomplete');
  if (!cohort.startsOn || !cohort.endsOn)
    throw catalogConflict('COHORT_DATES_REQUIRED', 'academic.cohortDatesRequired');
  const sessions = await transaction.session.count({
    where: { organizationId, cohortId: cohort.id, status: 'SCHEDULED' },
  });
  if (!sessions)
    throw catalogConflict('COHORT_SESSIONS_REQUIRED', 'academic.cohortSessionsRequired');
}

export type CohortIntakeCounts = {
  confirmedEnrollmentCount: number;
  pendingEnrollmentCount: number;
  postponedEnrollmentCount: number;
  reservedEnrollmentCount: number;
};

export function emptyIntakeCounts(): CohortIntakeCounts {
  return {
    confirmedEnrollmentCount: 0,
    pendingEnrollmentCount: 0,
    postponedEnrollmentCount: 0,
    reservedEnrollmentCount: 0,
  };
}

// Intake belongs to this exact cohort, never to imported aliases with similar codes.
export async function readCohortIntakeCounts(
  database: Pick<Prisma.TransactionClient, 'enrollmentCohortAssignment' | 'enrollment'>,
  organizationId: string,
  cohortIds: string[],
): Promise<Map<string, CohortIntakeCounts>> {
  const result = new Map(cohortIds.map((id) => [id, emptyIntakeCounts()]));
  if (!cohortIds.length) return result;
  const assignments = await database.enrollmentCohortAssignment.findMany({
    where: { organizationId, cohortId: { in: cohortIds }, endsAt: null },
    select: { cohortId: true, enrollmentId: true },
  });
  if (!assignments.length) return result;
  const enrollments = await database.enrollment.findMany({
    where: { organizationId, id: { in: assignments.map(({ enrollmentId }) => enrollmentId) } },
    select: { id: true, state: true },
  });
  const states = new Map(enrollments.map(({ id, state }) => [id, state]));
  const seen = new Set<string>();
  for (const { cohortId, enrollmentId } of assignments) {
    const counts = result.get(cohortId);
    const key = `${cohortId}:${enrollmentId}`;
    if (!counts || seen.has(key)) continue;
    seen.add(key);
    // All open assignments still reserve a seat under the existing capacity policy.
    counts.reservedEnrollmentCount += 1;
    const state = states.get(enrollmentId);
    if (state === 'ACTIVE') counts.confirmedEnrollmentCount += 1;
    else if (state === 'DRAFT' || state === 'PENDING_APPROVAL') counts.pendingEnrollmentCount += 1;
    else if (state === 'POSTPONED') counts.postponedEnrollmentCount += 1;
  }
  return result;
}

export function cohortIntakeSummary(
  cohort: { status: string; capacity: number | null },
  counts: CohortIntakeCounts,
) {
  const target = cohort.capacity !== null && cohort.capacity > 0 ? cohort.capacity : null;
  const remaining = target === null ? null : Math.max(0, target - counts.confirmedEnrollmentCount);
  return {
    ...counts,
    remainingEnrollmentCount: remaining,
    intakeStatus:
      cohort.status !== 'PLANNED'
        ? cohort.status
        : target === null
          ? 'TARGET_REQUIRED'
          : remaining === 0
            ? 'READY_TO_START'
            : 'COLLECTING',
  };
}
