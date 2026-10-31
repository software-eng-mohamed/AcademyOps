import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { codeFrom, type CalendarValue } from './import-values';
import { ImportCatalogBuilder } from './import-catalog-builder';
import { groupCalendarPrograms, updateCohortScheduleBounds } from './import-schedule-bounds';

type ImportRow = { id: string; normalizedValues: Prisma.JsonValue | null };

@Injectable()
export class ImportCatalogWriter {
  constructor(private readonly builder: ImportCatalogBuilder) {}

  async writeCalendar(
    db: Prisma.TransactionClient,
    access: AccessContext,
    rows: ImportRow[],
  ): Promise<void> {
    if (!rows.length) return;
    const branch = await this.branch(db, access);
    const values = rows.map((row) => ({
      row,
      value: row.normalizedValues as unknown as CalendarValue,
    }));
    const versions = new Map<string, { id: string; modules: Map<string, string> }>();
    for (const group of groupCalendarPrograms(values)) {
      versions.set(
        group.code,
        await this.builder.ensureVersion(
          db,
          access.organizationId,
          group.code,
          group.name,
          group.modules,
        ),
      );
    }
    for (const entry of values) {
      const version = versions.get(entry.value.programCode);
      if (!version) throw this.conflict('IMPORT_PROGRAM_VERSION_MISSING');
      const cohort = await this.builder.ensureCohort(
        db,
        access.organizationId,
        branch.id,
        entry.value.cohortCode,
        version.id,
      );
      const moduleId = version.modules.get(entry.value.moduleName);
      if (!moduleId) throw this.conflict('IMPORT_MODULE_LINK_MISSING');
      const cohortModule = await this.builder.ensureCohortModule(
        db,
        access.organizationId,
        cohort.id,
        moduleId,
      );
      const existingReference = await db.legacyReference.findFirst({
        where: {
          organizationId: access.organizationId,
          entityType: 'SESSION',
          sourceField: 'SESSION_KEY',
          rawValue: `${entry.value.cohortCode}:${entry.value.sessionOrdinal}`,
        },
      });
      let session = existingReference
        ? await db.session.findFirst({
            where: { id: existingReference.entityId, organizationId: access.organizationId },
          })
        : null;
      if (!session) {
        const room = entry.value.roomCode
          ? await this.builder.ensureRoom(
              db,
              access.organizationId,
              branch.id,
              entry.value.roomCode,
            )
          : null;
        session = await db.session.create({
          data: {
            organizationId: access.organizationId,
            cohortModuleId: cohortModule.id,
            cohortId: cohort.id,
            roomId: room?.id ?? null,
            ordinal: entry.value.sessionOrdinal,
            startsAt: new Date(entry.value.startsAt),
            endsAt: new Date(entry.value.endsAt),
            deliveryMode: entry.value.deliveryMode,
            status: 'DRAFT',
          },
        });
        if (entry.value.trainerName)
          await this.attachTrainers(
            db,
            access.organizationId,
            session.id,
            entry.value.trainerName,
            session.startsAt,
            session.endsAt,
          );
        session = await db.session.update({
          where: { id: session.id },
          data: { status: 'SCHEDULED' },
        });
      }
      await this.reference(
        db,
        access.organizationId,
        entry.row.id,
        'SESSION',
        session.id,
        'CALENDAR_ROW',
        `${entry.value.cohortCode}:${entry.value.sessionOrdinal}`,
      );
      await this.reference(
        db,
        access.organizationId,
        entry.row.id,
        'SESSION',
        session.id,
        'SESSION_KEY',
        `${entry.value.cohortCode}:${entry.value.sessionOrdinal}`,
      );
      if (entry.value.coordinatorName)
        await this.reference(
          db,
          access.organizationId,
          entry.row.id,
          'SESSION',
          session.id,
          'SESSION_COORDINATOR',
          entry.value.coordinatorName,
        );
      await updateCohortScheduleBounds(
        db,
        cohort.id,
        new Date(entry.value.startsAt),
        new Date(entry.value.endsAt),
      );
      await db.importRow.update({
        where: { id: entry.row.id },
        data: { disposition: 'IMPORTED', targetType: 'SESSION', targetId: session.id },
      });
    }
  }

  async ensureLegacyCohort(
    db: Prisma.TransactionClient,
    organizationId: string,
    branchId: string,
    programCode: string,
    cohortCode: string,
  ) {
    const existing = await this.builder.findCohortBySourceCode(db, organizationId, cohortCode);
    if (existing) {
      const cohortModule = await db.cohortModule.findFirst({
        where: { organizationId, cohortId: existing.id },
      });
      if (cohortModule) return existing;
      const versionModule = await db.programVersionModule.findFirst({
        where: { organizationId, programVersionId: existing.programVersionId },
        orderBy: { ordinal: 'asc' },
      });
      if (!versionModule) throw this.conflict('IMPORT_PROGRAM_MODULE_MISSING');
      await this.builder.ensureCohortModule(
        db,
        organizationId,
        existing.id,
        versionModule.moduleId,
      );
      return existing;
    }
    const version = await this.builder.ensureVersion(db, organizationId, programCode, programCode, [
      'Legacy curriculum',
    ]);
    const cohort = await this.builder.ensureCohort(
      db,
      organizationId,
      branchId,
      cohortCode,
      version.id,
    );
    const moduleId = version.modules.get('Legacy curriculum');
    if (!moduleId) throw this.conflict('IMPORT_MODULE_LINK_MISSING');
    await this.builder.ensureCohortModule(db, organizationId, cohort.id, moduleId);
    return cohort;
  }

  async ensurePlaceholderSession(
    db: Prisma.TransactionClient,
    organizationId: string,
    cohortId: string,
    ordinal: number,
    deliveryMode = 'IN_PERSON',
  ) {
    const existing = await db.session.findFirst({ where: { organizationId, cohortId, ordinal } });
    if (existing) return existing;
    const cohortModule = await db.cohortModule.findFirst({
      where: { organizationId, cohortId },
      orderBy: { ordinal: 'asc' },
    });
    if (!cohortModule) throw this.conflict('IMPORT_COHORT_MODULE_MISSING');
    return db.session.create({
      data: {
        organizationId,
        cohortId,
        cohortModuleId: cohortModule.id,
        ordinal,
        deliveryMode: deliveryMode || 'IN_PERSON',
        status: 'DRAFT',
      },
    });
  }

  private async attachTrainers(
    db: Prisma.TransactionClient,
    organizationId: string,
    sessionId: string,
    names: string,
    startsAt: Date | null,
    endsAt: Date | null,
  ): Promise<void> {
    for (const name of names
      .split(/\\|\/|,/)
      .map((part) => part.trim())
      .filter(Boolean)) {
      const publicId = `TRN-${codeFrom(name, 'TRAINER').slice(0, 24)}`;
      const person = await db.person.upsert({
        where: { organizationId_publicId: { organizationId, publicId } },
        update: {},
        create: { organizationId, publicId, name: name },
      });
      const trainer = await db.trainerProfile.upsert({
        where: { organizationId_personId: { organizationId, personId: person.id } },
        update: {},
        create: { organizationId, personId: person.id },
      });
      await db.sessionTrainer.upsert({
        where: {
          organizationId_sessionId_trainerId_role: {
            organizationId,
            sessionId,
            trainerId: trainer.id,
            role: 'PRIMARY',
          },
        },
        update: {},
        create: {
          organizationId,
          sessionId,
          trainerId: trainer.id,
          startsAt,
          endsAt,
          role: 'PRIMARY',
        },
      });
    }
  }

  private async branch(db: Prisma.TransactionClient, access: AccessContext) {
    const preferred = [...access.branchIds][0];
    const branch = await db.branch.findFirst({
      where: { organizationId: access.organizationId, ...(preferred ? { id: preferred } : {}) },
      orderBy: { createdAt: 'asc' },
    });
    if (!branch) throw this.conflict('IMPORT_BRANCH_REQUIRED');
    return branch;
  }

  private async reference(
    db: Prisma.TransactionClient,
    organizationId: string,
    importRowId: string,
    entityType: string,
    entityId: string,
    sourceField: string,
    rawValue: string,
  ): Promise<void> {
    const exists = await db.legacyReference.findFirst({
      where: { organizationId, importRowId, entityType, entityId, sourceField, rawValue },
    });
    if (!exists)
      await db.legacyReference.create({
        data: { organizationId, importRowId, entityType, entityId, sourceField, rawValue },
      });
  }

  private conflict(code: string): ConflictException {
    return new ConflictException({ code, messageKey: `imports.${code.toLowerCase()}` });
  }
}
