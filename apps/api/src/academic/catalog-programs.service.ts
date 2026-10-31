import { Injectable } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { AuditService } from '../platform/audit/audit.service';
import { PrismaService } from '../platform/database/prisma.service';
import type {
  CreateAcademicModuleDto,
  CreateProgramDto,
  ListCatalogDto,
  UpdateAcademicModuleDto,
  UpdateProgramDto,
} from './catalog.dto';
import {
  catalogConflict,
  catalogNotFound,
  catalogPage,
  catalogVersionConflict,
} from './catalog-helper';
@Injectable()
export class CatalogProgramsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  async listPrograms(access: AccessContext, input: ListCatalogDto) {
    const canManage = access.grants.get('academic.programs.manage')?.has('O') ?? false;
    // Intersect the requested filter with the published catalog visibility;
    // never silently replace an archived filter with active results.
    if (!canManage && input.status && input.status !== 'ACTIVE') {
      return { items: [], nextCursor: null };
    }
    const programs = await this.prisma.program.findMany({
      where: {
        organizationId: access.organizationId,
        ...(canManage ? (input.status ? { status: input.status } : {}) : { status: 'ACTIVE' }),
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
    const visible = programs.slice(0, input.limit);
    const versions = visible.length
      ? await this.prisma.programVersion.findMany({
          where: {
            organizationId: access.organizationId,
            programId: { in: visible.map(({ id }) => id) },
            ...(!canManage ? { status: 'PUBLISHED' } : {}),
          },
          orderBy: { version: 'desc' },
        })
      : [];
    return {
      items: visible.map((program) => ({
        ...program,
        versions: versions.filter(({ programId }) => programId === program.id),
      })),
      nextCursor: programs.length > input.limit ? (visible.at(-1)?.id ?? null) : null,
    };
  }
  async readProgram(access: AccessContext, id: string) {
    const canManage = access.grants.get('academic.programs.manage')?.has('O') ?? false;
    const [program, versions] = await Promise.all([
      this.prisma.program.findFirst({
        where: { id, organizationId: access.organizationId },
      }),
      this.prisma.programVersion.findMany({
        where: {
          organizationId: access.organizationId,
          programId: id,
          ...(!canManage ? { status: 'PUBLISHED' } : {}),
        },
        orderBy: { version: 'desc' },
      }),
    ]);
    if (!program) throw catalogNotFound('PROGRAM_NOT_FOUND', 'academic.programNotFound');
    if (!canManage && program.status !== 'ACTIVE')
      throw catalogNotFound('PROGRAM_NOT_FOUND', 'academic.programNotFound');
    return { ...program, versions };
  }
  async createProgram(access: AccessContext, input: CreateProgramDto, correlationId: string) {
    const code = input.code.trim().toUpperCase();
    await this.ensureCodeAvailable('program', access.organizationId, code);
    return this.prisma.$transaction(async (transaction) => {
      const program = await transaction.program.create({
        data: {
          organizationId: access.organizationId,
          code,
          name: input.name.trim(),
        },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'program.create',
        entityType: 'Program',
        entityId: program.id,
        correlationId,
        after: { code, name: program.name },
      });
      return program;
    });
  }
  async updateProgram(
    access: AccessContext,
    id: string,
    input: UpdateProgramDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const program = await transaction.program.findFirst({
        where: { id, organizationId: access.organizationId },
      });
      if (!program) throw catalogNotFound('PROGRAM_NOT_FOUND', 'academic.programNotFound');
      if (program.version !== expectedVersion) throw catalogVersionConflict();
      const updated = await transaction.program.update({
        where: { id: program.id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name.trim() }),
          ...(input.status === undefined ? {} : { status: input.status }),
          version: { increment: 1 },
        },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'program.update',
        entityType: 'Program',
        entityId: program.id,
        correlationId,
        before: { name: program.name, status: program.status },
        after: { name: updated.name, status: updated.status },
      });
      return updated;
    });
  }
  async listModules(access: AccessContext, input: ListCatalogDto) {
    const canManage = access.grants.get('academic.programs.manage')?.has('O') ?? false;
    const modules = await this.prisma.academicModule.findMany({
      where: {
        organizationId: access.organizationId,
        ...(!canManage ? { isActive: true } : {}),
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
    return catalogPage(modules, input.limit);
  }
  async createModule(access: AccessContext, input: CreateAcademicModuleDto, correlationId: string) {
    const code = input.code.trim().toUpperCase();
    await this.ensureCodeAvailable('module', access.organizationId, code);
    return this.prisma.$transaction(async (transaction) => {
      const module = await transaction.academicModule.create({
        data: {
          organizationId: access.organizationId,
          code,
          name: input.name.trim(),
        },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'academic_module.create',
        entityType: 'AcademicModule',
        entityId: module.id,
        correlationId,
        after: { code, name: module.name },
      });
      return module;
    });
  }
  async updateModule(
    access: AccessContext,
    id: string,
    input: UpdateAcademicModuleDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const module = await transaction.academicModule.findFirst({
        where: { id, organizationId: access.organizationId },
      });
      if (!module) throw catalogNotFound('MODULE_NOT_FOUND', 'academic.moduleNotFound');
      if (module.version !== expectedVersion) throw catalogVersionConflict();
      const updated = await transaction.academicModule.update({
        where: { id: module.id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name.trim() }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
          version: { increment: 1 },
        },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'academic_module.update',
        entityType: 'AcademicModule',
        entityId: module.id,
        correlationId,
        before: { name: module.name, isActive: module.isActive },
        after: { name: updated.name, isActive: updated.isActive },
      });
      return updated;
    });
  }
  private async ensureCodeAvailable(
    type: 'program' | 'module',
    organizationId: string,
    code: string,
  ) {
    const existing =
      type === 'program'
        ? await this.prisma.program.findFirst({ where: { organizationId, code } })
        : await this.prisma.academicModule.findFirst({ where: { organizationId, code } });
    if (existing)
      throw catalogConflict(
        type === 'program' ? 'PROGRAM_CODE_EXISTS' : 'MODULE_CODE_EXISTS',
        type === 'program' ? 'academic.programCodeExists' : 'academic.moduleCodeExists',
      );
  }
}
