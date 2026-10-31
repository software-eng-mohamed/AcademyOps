import type { AccessContext } from '@academyops/contracts';
import { describe, expect, it, vi } from 'vitest';
import { EnrollmentQueryService } from '../src/enrollment/enrollment-query.service';
import type { PrismaService } from '../src/platform/database/prisma.service';

const enrollment = {
  id: 'enrollment-1',
  organizationId: 'org-1',
  studentPersonId: 'person-1',
  programVersionId: 'version-1',
  homeBranchId: 'branch-1',
  state: 'ACTIVE',
  version: 4,
};

function access(cancelPermission: boolean): AccessContext {
  return {
    organizationId: 'org-1',
    actorUserId: 'owner-1',
    grants: new Map([
      ['enrollments.read', new Set(['O'])],
      ...(cancelPermission ? ([['enrollments.cancel.approve', new Set(['O'])]] as const) : []),
    ]),
    branchIds: new Set(['branch-1']),
    assignedResourceIds: new Set(),
  } as AccessContext;
}

function setup() {
  const cancellationFindMany = vi
    .fn()
    .mockResolvedValue([{ id: 'request-1', enrollmentId: enrollment.id, status: 'REQUESTED' }]);
  const prisma = {
    $transaction: vi.fn((callback: (client: unknown) => unknown) =>
      Promise.resolve(callback(prisma)),
    ),
    enrollment: {
      findFirst: vi.fn().mockResolvedValue(enrollment),
      findMany: vi.fn().mockResolvedValue([]),
    },
    person: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: 'person-1', publicId: 'ST-1', name: 'Student One' }]),
    },
    programVersion: {
      findMany: vi.fn().mockResolvedValue([{ id: 'version-1', programId: 'program-1' }]),
    },
    program: { findMany: vi.fn().mockResolvedValue([{ id: 'program-1', name: 'Program' }]) },
    cohort: { findMany: vi.fn().mockResolvedValue([]) },
    enrollmentCohortAssignment: { findMany: vi.fn().mockResolvedValue([]) },
    enrollmentEvent: { findMany: vi.fn().mockResolvedValue([]) },
    moduleRetake: { findMany: vi.fn().mockResolvedValue([]) },
    enrollmentCancellationRequest: { findMany: cancellationFindMany },
  };
  return {
    cancellationFindMany,
    service: new EnrollmentQueryService(prisma as unknown as PrismaService),
  };
}

describe('enrollment cancellation request reads', () => {
  it('returns organization-scoped cancellation requests to approvers', async () => {
    const { cancellationFindMany, service } = setup();
    const result = await service.read(access(true), enrollment.id);

    expect(result.cancellationRequests).toEqual([
      { id: 'request-1', enrollmentId: enrollment.id, status: 'REQUESTED' },
    ]);
    expect(cancellationFindMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', enrollmentId: enrollment.id },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('does not query or disclose cancellation requests without a cancellation grant', async () => {
    const { cancellationFindMany, service } = setup();
    const result = await service.read(access(false), enrollment.id);

    expect(result.cancellationRequests).toEqual([]);
    expect(cancellationFindMany).not.toHaveBeenCalled();
  });

  it('honors cancellation permission scopes even when enrollment read is organization-wide', async () => {
    const { cancellationFindMany, service } = setup();
    const restricted = access(false);
    const result = await service.read(
      {
        ...restricted,
        grants: new Map([
          ['enrollments.read', new Set(['O'])],
          ['enrollments.cancel.approve', new Set(['B'])],
        ]),
        branchIds: new Set(['different-branch']),
      },
      enrollment.id,
    );

    expect(result.cancellationRequests).toEqual([]);
    expect(cancellationFindMany).not.toHaveBeenCalled();
  });
});
