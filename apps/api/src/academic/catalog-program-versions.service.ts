import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { AuditService } from '../platform/audit/audit.service';
import { PrismaService } from '../platform/database/prisma.service';
import { OutboxService } from '../platform/outbox/outbox.service';
import type {
  CreateProgramVersionDto,
  CurriculumModuleDto,
  PublishProgramVersionDto,
  ReplaceCurriculumDto,
} from './catalog.dto';
import { catalogConflict, catalogNotFound, catalogVersionConflict } from './catalog-helper';

type Transaction = Prisma.TransactionClient;

@Injectable()
export class CatalogProgramVersionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async createProgramVersion(
    access: AccessContext,
    programId: string,
    input: CreateProgramVersionDto,
    correlationId: string,
  ) {
    return this.prisma.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM programs WHERE id = ${programId}::uuid AND organization_id = ${access.organizationId}::uuid FOR UPDATE`;
      const program = await transaction.program.findFirst({
        where: { id: programId, organizationId: access.organizationId },
      });
      if (!program) throw catalogNotFound('PROGRAM_NOT_FOUND', 'academic.programNotFound');
      const draftExists = await transaction.programVersion.count({
        where: { organizationId: access.organizationId, programId: program.id, status: 'DRAFT' },
      });
      if (draftExists) throw catalogConflict('PROGRAM_DRAFT_EXISTS', 'academic.programDraftExists');
      const modules = await this.validateCurriculum(
        transaction,
        access.organizationId,
        input.modules,
      );
      const latest = await transaction.programVersion.aggregate({
        where: { organizationId: access.organizationId, programId: program.id },
        _max: { version: true },
      });
      const version = await transaction.programVersion.create({
        data: {
          organizationId: access.organizationId,
          programId: program.id,
          version: (latest._max.version ?? 0) + 1,
          effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
        },
      });
      await this.writeCurriculum(transaction, access.organizationId, version.id, modules);
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'program_version.create',
        entityType: 'ProgramVersion',
        entityId: version.id,
        correlationId,
        after: { programId: program.id, version: version.version, modules },
      });
      return { ...version, modules };
    });
  }

  async readProgramVersion(access: AccessContext, id: string) {
    const [version, lines] = await Promise.all([
      this.prisma.programVersion.findFirst({
        where: { id, organizationId: access.organizationId },
      }),
      this.prisma.programVersionModule.findMany({
        where: { organizationId: access.organizationId, programVersionId: id },
        orderBy: { ordinal: 'asc' },
      }),
    ]);
    if (!version) throw catalogNotFound('PROGRAM_VERSION_NOT_FOUND', 'academic.versionNotFound');
    const canManage = access.grants.get('academic.programs.manage')?.has('O') ?? false;
    if (!canManage && version.status !== 'PUBLISHED')
      throw catalogNotFound('PROGRAM_VERSION_NOT_FOUND', 'academic.versionNotFound');
    const moduleIds = lines.map(({ moduleId }) => moduleId);
    const modules = moduleIds.length
      ? await this.prisma.academicModule.findMany({
          where: {
            organizationId: access.organizationId,
            id: { in: moduleIds },
          },
        })
      : [];
    return {
      ...version,
      modules: lines.map((line) => ({
        ...line,
        module: modules.find(({ id: moduleId }) => moduleId === line.moduleId) ?? null,
      })),
    };
  }

  async replaceCurriculum(
    access: AccessContext,
    id: string,
    input: ReplaceCurriculumDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.prisma.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM program_versions WHERE id = ${id}::uuid AND organization_id = ${access.organizationId}::uuid FOR UPDATE`;
      const version = await transaction.programVersion.findFirst({
        where: { id, organizationId: access.organizationId },
      });
      if (!version) throw catalogNotFound('PROGRAM_VERSION_NOT_FOUND', 'academic.versionNotFound');
      if (version.recordVersion !== expectedVersion) throw catalogVersionConflict();
      if (version.status !== 'DRAFT')
        throw catalogConflict('CURRICULUM_IMMUTABLE', 'academic.curriculumImmutable');
      const modules = await this.validateCurriculum(
        transaction,
        access.organizationId,
        input.modules,
      );
      const before = await transaction.programVersionModule.findMany({
        where: { organizationId: access.organizationId, programVersionId: version.id },
        select: { moduleId: true, ordinal: true, required: true },
      });
      await transaction.programVersionModule.deleteMany({
        where: { organizationId: access.organizationId, programVersionId: version.id },
      });
      await this.writeCurriculum(transaction, access.organizationId, version.id, modules);
      const updated = await transaction.programVersion.update({
        where: { id: version.id },
        data: { recordVersion: { increment: 1 } },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'program_version.curriculum.replace',
        entityType: 'ProgramVersion',
        entityId: version.id,
        correlationId,
        before,
        after: modules,
      });
      return { id: updated.id, recordVersion: updated.recordVersion, modules };
    });
  }

  async publishProgramVersion(
    access: AccessContext,
    id: string,
    input: PublishProgramVersionDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.prisma.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM program_versions WHERE id = ${id}::uuid AND organization_id = ${access.organizationId}::uuid FOR UPDATE`;
      const version = await transaction.programVersion.findFirst({
        where: { id, organizationId: access.organizationId },
      });
      if (!version) throw catalogNotFound('PROGRAM_VERSION_NOT_FOUND', 'academic.versionNotFound');
      if (version.recordVersion !== expectedVersion) throw catalogVersionConflict();
      if (version.status !== 'DRAFT')
        throw catalogConflict('PROGRAM_VERSION_NOT_DRAFT', 'academic.versionNotDraft');
      const curriculumCount = await transaction.programVersionModule.count({
        where: { organizationId: access.organizationId, programVersionId: version.id },
      });
      if (!curriculumCount)
        throw catalogConflict('CURRICULUM_REQUIRED', 'academic.curriculumRequired');
      const updated = await transaction.programVersion.update({
        where: { id: version.id },
        data: {
          status: 'PUBLISHED',
          effectiveFrom: new Date(input.effectiveFrom),
          recordVersion: { increment: 1 },
        },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'program_version.publish',
        entityType: 'ProgramVersion',
        entityId: version.id,
        correlationId,
        before: { status: version.status },
        after: { status: updated.status, effectiveFrom: input.effectiveFrom },
      });
      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'ProgramVersion',
        aggregateId: version.id,
        type: 'program_version.published',
        payload: { programVersionId: version.id, programId: version.programId },
      });
      return updated;
    });
  }

  async archiveProgramVersion(
    access: AccessContext,
    id: string,
    reason: string,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.prisma.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM program_versions WHERE id = ${id}::uuid AND organization_id = ${access.organizationId}::uuid FOR UPDATE`;
      const version = await transaction.programVersion.findFirst({
        where: { id, organizationId: access.organizationId },
      });
      if (!version) throw catalogNotFound('PROGRAM_VERSION_NOT_FOUND', 'academic.versionNotFound');
      if (version.recordVersion !== expectedVersion) throw catalogVersionConflict();
      if (version.status !== 'PUBLISHED')
        throw catalogConflict('PROGRAM_VERSION_NOT_PUBLISHED', 'academic.versionNotPublished');
      const updated = await transaction.programVersion.update({
        where: { id: version.id },
        data: { status: 'ARCHIVED', effectiveTo: new Date(), recordVersion: { increment: 1 } },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'program_version.archive',
        entityType: 'ProgramVersion',
        entityId: version.id,
        correlationId,
        before: { status: version.status },
        after: { status: updated.status },
        metadata: { reason },
      });
      return updated;
    });
  }

  private async validateCurriculum(
    transaction: Transaction,
    organizationId: string,
    input: CurriculumModuleDto[],
  ) {
    const moduleIds = input.map(({ moduleId }) => moduleId);
    const ordinals = input.map(({ ordinal }) => ordinal);
    if (new Set(moduleIds).size !== moduleIds.length || new Set(ordinals).size !== ordinals.length)
      throw catalogConflict('CURRICULUM_DUPLICATE', 'academic.curriculumDuplicate');
    const modules = await transaction.academicModule.findMany({
      where: { organizationId, id: { in: moduleIds }, isActive: true },
      select: { id: true },
    });
    if (modules.length !== moduleIds.length)
      throw catalogConflict('CURRICULUM_MODULE_INVALID', 'academic.curriculumModuleInvalid');
    return input
      .map(({ moduleId, ordinal, required }) => ({ moduleId, ordinal, required: required ?? true }))
      .sort((left, right) => left.ordinal - right.ordinal);
  }

  private async writeCurriculum(
    transaction: Transaction,
    organizationId: string,
    programVersionId: string,
    modules: Array<{ moduleId: string; ordinal: number; required: boolean }>,
  ) {
    if (!modules.length) return;
    await transaction.programVersionModule.createMany({
      data: modules.map((module) => ({ organizationId, programVersionId, ...module })),
    });
  }
}
