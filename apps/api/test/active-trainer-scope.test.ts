import type { AccessContext, PermissionCode } from '@academyops/contracts';
import { describe, expect, it, vi } from 'vitest';
import { CatalogAccessService } from '../src/academic/catalog-access.service';
import { AcademicService } from '../src/academic/academic.service';
import { EnrollmentQueryService } from '../src/enrollment/enrollment-query.service';
import type { PrismaService } from '../src/platform/database/prisma.service';

const assignedAccess = (permission: PermissionCode): AccessContext => ({
  organizationId: 'org-1',
  actorUserId: 'user-1',
  grants: new Map([[permission, new Set(['A'])]]),
  branchIds: new Set(),
  assignedResourceIds: new Set(),
});

describe('active trainer assignment scope', () => {
  it('hides unscheduled draft placeholders from the default staff session list', async () => {
    const findMany = vi
      .fn<(input: { where: unknown }) => Promise<unknown[]>>()
      .mockResolvedValue([]);
    const prisma = { session: { findMany } } as unknown as PrismaService;
    const access: AccessContext = {
      ...assignedAccess('academic.catalog.read'),
      grants: new Map([['academic.catalog.read', new Set(['O'])]]),
    };

    await new AcademicService(prisma).listSessions(access, { limit: 50 });

    const [request] = findMany.mock.calls[0] ?? [];
    expect(request?.where).toMatchObject({ NOT: { status: 'DRAFT', startsAt: null } });
  });

  it('catalog visibility ignores cancelled trainer bookings', async () => {
    const sessionTrainer = { findMany: vi.fn().mockResolvedValue([]) };
    const trainerFindFirst = vi.fn().mockResolvedValue({ id: 'trainer-1' });
    const prisma = {
      user: { findFirst: vi.fn().mockResolvedValue({ personId: 'person-1' }) },
      trainerProfile: { findFirst: trainerFindFirst },
      sessionTrainer,
      session: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;

    const service = new CatalogAccessService(prisma);
    await expect(
      service.visibleCohortIds(assignedAccess('academic.catalog.read')),
    ).resolves.toEqual([]);
    expect(trainerFindFirst).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', personId: 'person-1', status: 'ACTIVE' },
      select: { id: true },
    });
    expect(sessionTrainer.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        trainerId: 'trainer-1',
        bookingStatus: 'CONFIRMED',
      },
      select: { sessionId: true },
    });
  });

  it('enrollment visibility ignores cancelled trainer bookings', async () => {
    const sessionTrainer = { findMany: vi.fn().mockResolvedValue([]) };
    const trainerFindFirst = vi.fn().mockResolvedValue({ id: 'trainer-1' });
    const transaction = {
      enrollmentEvent: { findMany: vi.fn().mockResolvedValue([]) },
      lead: { findMany: vi.fn().mockResolvedValue([]) },
      leadConversion: { findMany: vi.fn().mockResolvedValue([]) },
      user: { findFirst: vi.fn().mockResolvedValue({ personId: 'person-1' }) },
      trainerProfile: { findFirst: trainerFindFirst },
      sessionTrainer,
      session: { findMany: vi.fn().mockResolvedValue([]) },
      enrollmentCohortAssignment: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new EnrollmentQueryService({} as PrismaService);

    await expect(
      service.visibleEnrollmentIds(
        transaction as never,
        assignedAccess('enrollments.read'),
        'enrollments.read',
      ),
    ).resolves.toEqual([]);
    expect(trainerFindFirst).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', personId: 'person-1', status: 'ACTIVE' },
      select: { id: true },
    });
    expect(sessionTrainer.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        trainerId: 'trainer-1',
        bookingStatus: 'CONFIRMED',
      },
      select: { sessionId: true },
    });
  });

  it('session visibility ignores inactive trainers and cancelled bookings', async () => {
    const sessionTrainer = { findMany: vi.fn().mockResolvedValue([]) };
    const trainerFindFirst = vi.fn().mockResolvedValue({ id: 'trainer-1' });
    const prisma = {
      user: { findFirst: vi.fn().mockResolvedValue({ personId: 'person-1' }) },
      trainerProfile: { findFirst: trainerFindFirst },
      sessionTrainer,
      session: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;

    const service = new AcademicService(prisma);
    await service.listSessions(assignedAccess('academic.catalog.read'), { limit: 50 });

    expect(trainerFindFirst).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', personId: 'person-1', status: 'ACTIVE' },
      select: { id: true },
    });
    expect(sessionTrainer.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        trainerId: 'trainer-1',
        bookingStatus: 'CONFIRMED',
      },
      select: { sessionId: true },
    });
  });

  it('student session visibility enforces assignment windows and hides drafts', async () => {
    const startsAt = new Date('2026-08-01T00:00:00Z');
    const endsAt = new Date('2026-09-01T00:00:00Z');
    const sessionFindMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      enrollment: { findMany: vi.fn().mockResolvedValue([{ id: 'enrollment-1' }]) },
      enrollmentCohortAssignment: {
        findMany: vi.fn().mockResolvedValue([{ cohortId: 'cohort-1', startsAt, endsAt }]),
      },
      session: { findMany: sessionFindMany },
    } as unknown as PrismaService;
    const access: AccessContext = {
      ...assignedAccess('academic.catalog.read'),
      grants: new Map([['academic.catalog.read', new Set(['S'])]]),
      studentPersonId: 'person-1',
    };

    await new AcademicService(prisma).listSessions(access, { limit: 50 });

    expect(sessionFindMany.mock.calls[0]?.[0]).toEqual({
      where: {
        organizationId: 'org-1',
        OR: [{ cohortId: 'cohort-1', startsAt: { gte: startsAt, lt: endsAt } }],
        status: { not: 'DRAFT' },
      },
      select: { id: true },
    });
  });
});
