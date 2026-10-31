import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import type { PrismaService } from '../platform/database/prisma.service';

export type StudentCohortAssignmentWindow = {
  cohortId: string;
  startsAt: Date;
  endsAt: Date | null;
};

export function isStudentOnly(access: AccessContext): boolean {
  const scopes = access.grants.get('academic.catalog.read');
  return !!(scopes?.has('S') && !scopes?.has('O') && !scopes?.has('B') && !scopes?.has('A'));
}

export async function listStudentCohortAssignmentWindows(
  prisma: PrismaService,
  access: AccessContext,
): Promise<StudentCohortAssignmentWindow[]> {
  if (!access.studentPersonId) return [];
  const enrollments = await prisma.enrollment.findMany({
    where: {
      organizationId: access.organizationId,
      studentPersonId: access.studentPersonId,
    },
    select: { id: true },
  });
  return prisma.enrollmentCohortAssignment.findMany({
    where: {
      organizationId: access.organizationId,
      enrollmentId: { in: enrollments.map(({ id }) => id) },
    },
    select: { cohortId: true, startsAt: true, endsAt: true },
  });
}

export function studentSessionVisibilityWhere(
  assignments: StudentCohortAssignmentWindow[],
): Prisma.SessionWhereInput {
  if (!assignments.length) return { id: { in: [] } };
  return {
    OR: assignments.map(({ cohortId, startsAt, endsAt }) => ({
      cohortId,
      startsAt: { gte: startsAt, ...(endsAt ? { lt: endsAt } : {}) },
    })),
  };
}

export function catalogPage<T extends { id: string }>(items: T[], limit: number) {
  const visible = items.slice(0, limit);
  return {
    items: visible,
    nextCursor: items.length > limit ? (visible.at(-1)?.id ?? null) : null,
  };
}

export function catalogNotFound(code: string, messageKey: string): NotFoundException {
  return new NotFoundException({ code, messageKey });
}

export function catalogConflict(code: string, messageKey: string): ConflictException {
  return new ConflictException({ code, messageKey });
}

export function catalogVersionConflict(): ConflictException {
  return catalogConflict('VERSION_CONFLICT', 'errors.versionConflict');
}
