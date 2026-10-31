import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { normalizeCohortSourceCode } from '../academic/cohort-source-data';
import { codeFrom } from './import-values';
export type ImportProgramVersion = {
  id: string;
  modules: Map<string, string>;
};
@Injectable()
export class ImportCatalogBuilder {
  async ensureVersion(
    db: Prisma.TransactionClient,
    organizationId: string,
    code: string,
    name: string,
    moduleNames: string[],
  ): Promise<ImportProgramVersion> {
    const program = await db.program.upsert({
      where: { organizationId_code: { organizationId, code } },
      update: {},
      create: { organizationId, code, name: name },
    });
    const existing = await db.programVersion.findFirst({
      where: { organizationId, programId: program.id, status: 'PUBLISHED' },
      orderBy: { version: 'desc' },
    });
    if (existing) {
      const mapped = await this.versionModules(db, organizationId, existing.id);
      if (moduleNames.every((moduleName) => mapped.has(moduleName))) {
        return { id: existing.id, modules: mapped };
      }
    }
    const previousNames = existing
      ? [...(await this.versionModules(db, organizationId, existing.id)).keys()]
      : [];
    const allNames = [...new Set([...previousNames, ...moduleNames])];
    const latest = await db.programVersion.findFirst({
      where: { organizationId, programId: program.id },
      orderBy: { version: 'desc' },
    });
    const version = await db.programVersion.create({
      data: {
        organizationId,
        programId: program.id,
        version: (latest?.version ?? 0) + 1,
        status: 'DRAFT',
        effectiveFrom: new Date(),
      },
    });
    for (let index = 0; index < allNames.length; index += 1) {
      const moduleName = allNames[index]!;
      const moduleCode = codeFrom(`${code}-${moduleName}`, 'MODULE');
      const module = await db.academicModule.upsert({
        where: { organizationId_code: { organizationId, code: moduleCode } },
        update: {},
        create: { organizationId, code: moduleCode, name: moduleName },
      });
      await db.programVersionModule.create({
        data: {
          organizationId,
          programVersionId: version.id,
          moduleId: module.id,
          ordinal: index + 1,
        },
      });
    }
    await db.programVersion.update({ where: { id: version.id }, data: { status: 'PUBLISHED' } });
    return { id: version.id, modules: await this.versionModules(db, organizationId, version.id) };
  }
  async ensureCohort(
    db: Prisma.TransactionClient,
    organizationId: string,
    branchId: string,
    code: string,
    programVersionId: string,
  ) {
    const existing = await this.findCohortBySourceCode(db, organizationId, code);
    if (existing) {
      if (existing.programVersionId !== programVersionId) {
        throw this.conflict('IMPORT_COHORT_VERSION_CONFLICT');
      }
      return existing;
    }
    const cohort = await db.cohort.create({
      data: {
        organizationId,
        programVersionId,
        owningBranchId: branchId,
        code,
        name: code,
        status: 'DRAFT',
      },
    });
    return db.cohort.update({ where: { id: cohort.id }, data: { status: 'PLANNED' } });
  }
  async findCohortBySourceCode(
    db: Prisma.TransactionClient,
    organizationId: string,
    sourceCode: string,
  ) {
    const exact = await db.cohort.findFirst({ where: { organizationId, code: sourceCode } });
    if (exact) return exact;
    const key = normalizeCohortSourceCode(sourceCode);
    const matches = (
      await db.cohort.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'asc' },
      })
    ).filter((cohort) => normalizeCohortSourceCode(cohort.code) === key);
    if (matches.length > 1) throw this.conflict('IMPORT_COHORT_SOURCE_CODE_AMBIGUOUS');
    return matches[0] ?? null;
  }
  async ensureCohortModule(
    db: Prisma.TransactionClient,
    organizationId: string,
    cohortId: string,
    moduleId: string,
  ) {
    const cohort = await db.cohort.findUniqueOrThrow({ where: { id: cohortId } });
    const pvm = await db.programVersionModule.findFirst({
      where: { organizationId, moduleId, programVersionId: cohort.programVersionId },
    });
    if (!pvm) throw this.conflict('IMPORT_PROGRAM_MODULE_MISSING');
    return db.cohortModule.upsert({
      where: {
        organizationId_cohortId_programVersionModuleId: {
          organizationId,
          cohortId,
          programVersionModuleId: pvm.id,
        },
      },
      update: {},
      create: { organizationId, cohortId, programVersionModuleId: pvm.id, ordinal: pvm.ordinal },
    });
  }
  async ensureRoom(
    db: Prisma.TransactionClient,
    organizationId: string,
    branchId: string,
    roomCode: string,
  ) {
    const code = codeFrom(roomCode, 'ROOM');
    return db.room.upsert({
      where: { organizationId_branchId_code: { organizationId, branchId, code } },
      update: {},
      create: { organizationId, branchId, code, name: roomCode },
    });
  }
  private async versionModules(
    db: Prisma.TransactionClient,
    organizationId: string,
    versionId: string,
  ): Promise<Map<string, string>> {
    const modules = await db.programVersionModule.findMany({
      where: { organizationId, programVersionId: versionId },
      orderBy: { ordinal: 'asc' },
    });
    const catalog = await db.academicModule.findMany({
      where: { organizationId, id: { in: modules.map((entry) => entry.moduleId) } },
    });
    return new Map(catalog.map((module) => [module.name, module.id]));
  }
  private conflict(code: string): ConflictException {
    return new ConflictException({ code, messageKey: `imports.${code.toLowerCase()}` });
  }
}
