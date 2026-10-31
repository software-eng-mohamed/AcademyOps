import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/platform/database/prisma.service';
import type { InternalEventEnvelope } from '../src/realtime/realtime.contracts';
import { RealtimeTargetResolverService } from '../src/realtime/realtime-target-resolver.service';

describe('RealtimeTargetResolverService', () => {
  it('keeps ImportBatch lifecycle events staff-only without trusting payload targets', async () => {
    const prisma = {} as PrismaService;
    const service = new RealtimeTargetResolverService(prisma);

    await expect(
      service.resolveStudentPersonIds(
        envelope('ImportBatch', { studentPersonId: 'attacker-target' }),
      ),
    ).resolves.toEqual([]);
  });

  it.each([
    {
      aggregateType: 'Enrollment',
      delegate: 'enrollment',
      aggregateResult: { studentPersonId: 'student-a' },
    },
    {
      aggregateType: 'AttendanceRecord',
      delegate: 'attendanceRecord',
      aggregateResult: { enrollmentId: 'enrollment-a' },
    },
    {
      aggregateType: 'Certificate',
      delegate: 'certificate',
      aggregateResult: { enrollmentId: 'enrollment-a' },
    },
    {
      aggregateType: 'Payment',
      delegate: 'payment',
      aggregateResult: { enrollmentId: 'enrollment-a', billingAccountId: 'billing-a' },
    },
  ])('resolves $aggregateType targets from tenant data, never payload IDs', async (scenario) => {
    const aggregateFind = vi.fn().mockResolvedValue(scenario.aggregateResult);
    const enrollmentFind = vi.fn().mockResolvedValue({ studentPersonId: 'student-a' });
    const prisma = {
      [scenario.delegate]: { findFirst: aggregateFind },
      ...(scenario.delegate === 'enrollment' ? {} : { enrollment: { findFirst: enrollmentFind } }),
    } as unknown as PrismaService;
    const service = new RealtimeTargetResolverService(prisma);
    const event = envelope(scenario.aggregateType, { studentPersonId: 'attacker-target' });

    await expect(service.resolveStudentPersonIds(event)).resolves.toEqual(['student-a']);
    expect(aggregateFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-a', id: 'aggregate-a' } }),
    );
  });

  it('resolves session recipients from time-bounded cohort assignments', async () => {
    const at = new Date('2026-08-11T12:00:00.000Z');
    const assignments = vi
      .fn<(input: unknown) => Promise<Array<{ enrollmentId: string }>>>()
      .mockResolvedValue([{ enrollmentId: 'enrollment-a' }, { enrollmentId: 'enrollment-b' }]);
    const prisma = {
      session: {
        findFirst: vi.fn().mockResolvedValue({ cohortId: 'cohort-a', startsAt: at, endsAt: at }),
      },
      enrollmentCohortAssignment: { findMany: assignments },
      enrollment: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ studentPersonId: 'student-a' }, { studentPersonId: 'student-b' }]),
      },
    } as unknown as PrismaService;
    const service = new RealtimeTargetResolverService(prisma);

    await expect(service.resolveStudentPersonIds(envelope('Session'))).resolves.toEqual([
      'student-a',
      'student-b',
    ]);
    const input = assignments.mock.calls[0]?.[0] as {
      where?: { organizationId?: string; cohortId?: string; startsAt?: { lte?: Date } };
    };
    expect(input.where).toMatchObject({
      organizationId: 'org-a',
      cohortId: 'cohort-a',
      startsAt: { lte: at },
    });
  });
});

function envelope(aggregateType: string, payload: unknown = {}): InternalEventEnvelope {
  return {
    v: 1,
    eventId: 'event-a',
    type: 'payment.posted',
    organizationId: 'org-a',
    aggregate: { type: aggregateType, id: 'aggregate-a' },
    occurredAt: '2026-08-11T12:00:00.000Z',
    payload,
  };
}
