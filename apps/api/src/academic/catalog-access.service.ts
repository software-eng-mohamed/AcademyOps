import { Injectable } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { PrismaService } from '../platform/database/prisma.service';
import { catalogNotFound } from './catalog-helper';

@Injectable()
export class CatalogAccessService {
  constructor(private readonly prisma: PrismaService) {}

  assertBranchManage(access: AccessContext, branchId: string) {
    const scopes = access.grants.get('academic.cohorts.manage');
    if (!scopes?.has('O') && !(scopes?.has('B') && access.branchIds.has(branchId))) {
      throw catalogNotFound('BRANCH_NOT_FOUND', 'branches.notFound');
    }
  }

  assignmentOnly(access: AccessContext): boolean {
    const scopes = access.grants.get('academic.catalog.read');
    return Boolean(scopes?.has('A') && !scopes.has('O') && !scopes.has('B'));
  }

  async actorTrainerId(access: AccessContext): Promise<string | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: access.actorUserId, organizationId: access.organizationId },
      select: { personId: true },
    });
    if (!user) return null;
    const trainer = await this.prisma.trainerProfile.findFirst({
      where: {
        organizationId: access.organizationId,
        personId: user.personId,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    return trainer?.id ?? null;
  }

  async assignedSessionIds(access: AccessContext): Promise<string[]> {
    const trainerId = await this.actorTrainerId(access);
    if (!trainerId) return [];
    return (
      await this.prisma.sessionTrainer.findMany({
        where: { organizationId: access.organizationId, trainerId, bookingStatus: 'CONFIRMED' },
        select: { sessionId: true },
      })
    ).map(({ sessionId }) => sessionId);
  }

  async visibleCohortIds(access: AccessContext): Promise<string[] | undefined> {
    const scopes = access.grants.get('academic.catalog.read');
    if (scopes?.has('O')) return undefined;
    if (scopes?.has('B')) {
      return (
        await this.prisma.cohort.findMany({
          where: {
            organizationId: access.organizationId,
            owningBranchId: { in: [...access.branchIds] },
          },
          select: { id: true },
        })
      ).map(({ id }) => id);
    }
    if (scopes?.has('A')) {
      const sessionIds = await this.assignedSessionIds(access);
      if (!sessionIds.length) return [];
      return [
        ...new Set(
          (
            await this.prisma.session.findMany({
              where: {
                organizationId: access.organizationId,
                id: { in: sessionIds },
              },
              select: { cohortId: true },
            })
          ).map(({ cohortId }) => cohortId),
        ),
      ];
    }
    return [];
  }
}
