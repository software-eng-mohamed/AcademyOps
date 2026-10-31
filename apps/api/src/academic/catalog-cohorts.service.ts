import { Injectable } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { AuditService } from '../platform/audit/audit.service';
import { PrismaService } from '../platform/database/prisma.service';
import { OutboxService } from '../platform/outbox/outbox.service';
import { CatalogAccessService } from './catalog-access.service';
import { enrichCohorts } from './catalog-cohort-source-read';
import type { CreateCohortDto, ListCatalogDto, UpdateCohortDto } from './catalog.dto';
import {
  assertCohortCanStart,
  assertCohortTarget,
  assertCohortTargetChange,
} from './cohort-intake';
import {
  catalogConflict,
  catalogNotFound,
  catalogPage,
  catalogVersionConflict,
} from './catalog-helper';

export type CohortCommand = 'plan' | 'activate' | 'complete' | 'cancel';

@Injectable()
export class CatalogCohortsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly accessPolicy: CatalogAccessService,
  ) {}

  async listCohorts(access: AccessContext, input: ListCatalogDto) {
    const visibleIds = await this.accessPolicy.visibleCohortIds(access);
    const cohorts = await this.prisma.cohort.findMany({
      where: {
        organizationId: access.organizationId,
        ...(visibleIds ? { id: { in: visibleIds } } : {}),
        ...(input.branchId ? { owningBranchId: input.branchId } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.search
          ? {
              OR: [
                { code: { contains: input.search, mode: 'insensitive' as const } },
                { name: { contains: input.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: { id: 'asc' },
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });
    const page = catalogPage(cohorts, input.limit);
    return { ...page, items: await enrichCohorts(this.prisma, access.organizationId, page.items) };
  }

  async readCohort(access: AccessContext, id: string) {
    const visibleIds = await this.accessPolicy.visibleCohortIds(access);
    if (visibleIds && !visibleIds.includes(id))
      throw catalogNotFound('COHORT_NOT_FOUND', 'academic.cohortNotFound');
    const cohort = await this.prisma.cohort.findFirst({
      where: { id, organizationId: access.organizationId },
    });
    if (!cohort) throw catalogNotFound('COHORT_NOT_FOUND', 'academic.cohortNotFound');
    const modules = await this.prisma.cohortModule.findMany({
      where: { organizationId: access.organizationId, cohortId: cohort.id },
      orderBy: { ordinal: 'asc' },
    });
    const versionModules = await this.prisma.programVersionModule.findMany({
      where: {
        organizationId: access.organizationId,
        id: { in: modules.map(({ programVersionModuleId }) => programVersionModuleId) },
      },
    });
    const catalogModules = await this.prisma.academicModule.findMany({
      where: {
        organizationId: access.organizationId,
        id: { in: versionModules.map(({ moduleId }) => moduleId) },
      },
    });
    const [enriched] = await enrichCohorts(this.prisma, access.organizationId, [cohort]);
    return {
      ...enriched,
      modules: modules.map((module) => {
        const versionModule = versionModules.find(({ id }) => id === module.programVersionModuleId);
        return {
          ...module,
          module: catalogModules.find(({ id }) => id === versionModule?.moduleId) ?? null,
        };
      }),
    };
  }

  async createCohort(access: AccessContext, input: CreateCohortDto, correlationId: string) {
    this.accessPolicy.assertBranchManage(access, input.owningBranchId);
    this.assertDateRange(input.startsOn, input.endsOn);
    return this.prisma.$transaction(async (transaction) => {
      const [branch, programVersion, duplicate] = await Promise.all([
        transaction.branch.findFirst({
          where: {
            id: input.owningBranchId,
            organizationId: access.organizationId,
            isActive: true,
          },
        }),
        transaction.programVersion.findFirst({
          where: {
            id: input.programVersionId,
            organizationId: access.organizationId,
            status: 'PUBLISHED',
          },
        }),
        transaction.cohort.findFirst({
          where: { organizationId: access.organizationId, code: input.code.trim().toUpperCase() },
        }),
      ]);
      if (!branch) throw catalogNotFound('BRANCH_NOT_FOUND', 'branches.notFound');
      if (!programVersion)
        throw catalogConflict('PUBLISHED_PROGRAM_REQUIRED', 'academic.publishedProgramRequired');
      if (duplicate) throw catalogConflict('COHORT_CODE_EXISTS', 'academic.cohortCodeExists');
      const curriculum = await transaction.programVersionModule.findMany({
        where: { organizationId: access.organizationId, programVersionId: programVersion.id },
        orderBy: { ordinal: 'asc' },
      });
      if (!curriculum.length)
        throw catalogConflict('CURRICULUM_REQUIRED', 'academic.curriculumRequired');
      const cohort = await transaction.cohort.create({
        data: {
          organizationId: access.organizationId,
          programVersionId: programVersion.id,
          owningBranchId: branch.id,
          code: input.code.trim().toUpperCase(),
          name: input.name?.trim() ?? null,
          startsOn: input.startsOn ? new Date(input.startsOn) : null,
          endsOn: input.endsOn ? new Date(input.endsOn) : null,
          capacity: input.capacity ?? null,
        },
      });
      await transaction.cohortModule.createMany({
        data: curriculum.map((line) => ({
          organizationId: access.organizationId,
          cohortId: cohort.id,
          programVersionModuleId: line.id,
          ordinal: line.ordinal,
        })),
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'cohort.create',
        entityType: 'Cohort',
        entityId: cohort.id,
        correlationId,
        after: {
          code: cohort.code,
          programVersionId: programVersion.id,
          owningBranchId: branch.id,
        },
      });
      return cohort;
    });
  }

  async updateCohort(
    access: AccessContext,
    id: string,
    input: UpdateCohortDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const cohort = await transaction.cohort.findFirst({
        where: { id, organizationId: access.organizationId },
      });
      if (!cohort) throw catalogNotFound('COHORT_NOT_FOUND', 'academic.cohortNotFound');
      this.accessPolicy.assertBranchManage(access, cohort.owningBranchId);
      if (cohort.version !== expectedVersion) throw catalogVersionConflict();
      if (!['DRAFT', 'PLANNED'].includes(cohort.status))
        throw catalogConflict('COHORT_DETAILS_LOCKED', 'academic.cohortDetailsLocked');
      const startsOn = input.startsOn ?? cohort.startsOn?.toISOString();
      const endsOn = input.endsOn ?? cohort.endsOn?.toISOString();
      this.assertDateRange(startsOn, endsOn);
      if (cohort.status === 'PLANNED' && input.capacity !== undefined) {
        assertCohortTarget(input.capacity);
        await assertCohortTargetChange(
          transaction,
          access.organizationId,
          cohort.id,
          input.capacity,
        );
      }
      const updated = await transaction.cohort.update({
        where: { id: cohort.id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name.trim() }),
          ...(input.startsOn === undefined ? {} : { startsOn: new Date(input.startsOn) }),
          ...(input.endsOn === undefined ? {} : { endsOn: new Date(input.endsOn) }),
          ...(input.capacity === undefined ? {} : { capacity: input.capacity }),
          version: { increment: 1 },
        },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'cohort.update',
        entityType: 'Cohort',
        entityId: cohort.id,
        correlationId,
        before: {
          name: cohort.name,
          startsOn: cohort.startsOn?.toISOString(),
          endsOn: cohort.endsOn?.toISOString(),
          capacity: cohort.capacity,
        },
        after: {
          name: updated.name,
          startsOn: updated.startsOn?.toISOString(),
          endsOn: updated.endsOn?.toISOString(),
          capacity: updated.capacity,
        },
      });
      return updated;
    });
  }

  async transitionCohort(
    access: AccessContext,
    id: string,
    command: CohortCommand,
    reason: string,
    expectedVersion: number,
    correlationId: string,
  ) {
    const transitions: Record<CohortCommand, { from: string[]; to: string }> = {
      plan: { from: ['DRAFT'], to: 'PLANNED' },
      activate: { from: ['PLANNED'], to: 'ACTIVE' },
      complete: { from: ['ACTIVE'], to: 'COMPLETED' },
      cancel: { from: ['DRAFT', 'PLANNED', 'ACTIVE'], to: 'CANCELLED' },
    };
    const transition = transitions[command];
    if (!transition)
      throw catalogConflict('COHORT_COMMAND_INVALID', 'academic.cohortCommandInvalid');
    return this.prisma.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM cohorts WHERE id = ${id}::uuid AND organization_id = ${access.organizationId}::uuid FOR UPDATE`;
      const cohort = await transaction.cohort.findFirst({
        where: { id, organizationId: access.organizationId },
      });
      if (!cohort) throw catalogNotFound('COHORT_NOT_FOUND', 'academic.cohortNotFound');
      this.accessPolicy.assertBranchManage(access, cohort.owningBranchId);
      if (cohort.version !== expectedVersion) throw catalogVersionConflict();
      if (!transition.from.includes(cohort.status))
        throw catalogConflict('COHORT_TRANSITION_INVALID', 'academic.cohortTransitionInvalid');
      if (command === 'plan') {
        assertCohortTarget(cohort.capacity);
      }
      if (command === 'activate') {
        await assertCohortCanStart(transaction, access.organizationId, cohort);
      }
      const updated = await transaction.cohort.update({
        where: { id: cohort.id },
        data: { status: transition.to, version: { increment: 1 } },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: `cohort.${command}`,
        entityType: 'Cohort',
        entityId: cohort.id,
        correlationId,
        before: { status: cohort.status },
        after: { status: updated.status },
        metadata: { reason },
      });
      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'Cohort',
        aggregateId: cohort.id,
        type: `cohort.${command}`,
        payload: { cohortId: cohort.id, from: cohort.status, to: updated.status },
      });
      return updated;
    });
  }

  private assertDateRange(startsOn?: string, endsOn?: string) {
    if ((endsOn && !startsOn) || (startsOn && endsOn && new Date(endsOn) < new Date(startsOn))) {
      throw catalogConflict('DATE_RANGE_INVALID', 'academic.dateRangeInvalid');
    }
  }
}
