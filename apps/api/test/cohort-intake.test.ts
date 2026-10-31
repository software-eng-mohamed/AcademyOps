import 'reflect-metadata';
import type { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  cohortIntakeSummary,
  emptyIntakeCounts,
  readCohortIntakeCounts,
} from '../src/academic/cohort-intake';

describe('capacity-driven cohort intake', () => {
  it('counts confirmed, pending and postponed enrollments separately and only for exact cohort IDs', async () => {
    const findAssignments = vi.fn().mockResolvedValue([
      { cohortId: 'group', enrollmentId: 'confirmed' },
      { cohortId: 'group', enrollmentId: 'confirmed' },
      { cohortId: 'group', enrollmentId: 'pending' },
      { cohortId: 'group', enrollmentId: 'draft' },
      { cohortId: 'group', enrollmentId: 'postponed' },
      { cohortId: 'group', enrollmentId: 'cancelled' },
      { cohortId: 'alias', enrollmentId: 'alias-confirmed' },
    ]);
    const findEnrollments = vi.fn().mockResolvedValue([
      { id: 'confirmed', state: 'ACTIVE' },
      { id: 'pending', state: 'PENDING_APPROVAL' },
      { id: 'draft', state: 'DRAFT' },
      { id: 'postponed', state: 'POSTPONED' },
      { id: 'cancelled', state: 'CANCELLED' },
      { id: 'alias-confirmed', state: 'ACTIVE' },
    ]);
    const database = {
      enrollmentCohortAssignment: { findMany: findAssignments },
      enrollment: { findMany: findEnrollments },
    } as unknown as Prisma.TransactionClient;
    const result = await readCohortIntakeCounts(database, 'org', ['group']);
    expect(result.get('group')).toEqual({
      confirmedEnrollmentCount: 1,
      pendingEnrollmentCount: 2,
      postponedEnrollmentCount: 1,
      reservedEnrollmentCount: 5,
    });
    expect(result.has('alias')).toBe(false);
    expect(findAssignments).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org', cohortId: { in: ['group'] }, endsAt: null },
      }),
    );
    expect(findEnrollments.mock.calls[0]?.[0] as unknown).toMatchObject({
      where: { organizationId: 'org' },
    });
  });

  it.each([
    [null, 0, 'TARGET_REQUIRED', null],
    [2, 0, 'COLLECTING', 2],
    [2, 1, 'COLLECTING', 1],
    [2, 2, 'READY_TO_START', 0],
    [2, 3, 'READY_TO_START', 0],
  ])(
    'derives readiness for target %s and %s confirmed',
    (capacity, confirmed, intakeStatus, remaining) => {
      expect(
        cohortIntakeSummary(
          { status: 'PLANNED', capacity },
          { ...emptyIntakeCounts(), confirmedEnrollmentCount: confirmed },
        ),
      ).toMatchObject({
        intakeStatus,
        remainingEnrollmentCount: remaining,
      });
    },
  );

  it.each(['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED'])(
    'preserves lifecycle state %s regardless of headcount',
    (status) => {
      expect(cohortIntakeSummary({ status, capacity: 2 }, emptyIntakeCounts()).intakeStatus).toBe(
        status,
      );
    },
  );
});
