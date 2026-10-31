import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { PrismaService } from '../platform/database/prisma.service';
import { ImportLifecycleEventsService } from './import-lifecycle-events.service';
import {
  asObject,
  parseAttendance,
  parseCalendar,
  parseMaster,
  masterEnrollmentKey,
  type MasterValue,
} from './import-values';
import type { XlsxScalar } from './xlsx-reader';
import { prepareAttendanceRows } from './import-attendance-validation';
import { ImportArchiveWriter } from './import-archive-writer';
import { saveRowValidation } from './import-validation-writer';
import {
  attendanceCohortsAvailable,
  attendanceLinks,
  meaningfulAttendance,
  meaningfulMaster,
} from './import-row-matching';
import {
  calendarConflictKeys,
  masterFinancialIssues,
  sourceErrors,
} from './import-validation-errors';
type Row = {
  id: string;
  sheetName: string;
  rowNumber: number;
  sourceFileId: string;
  rawValues: Prisma.JsonValue;
  normalizedValues: Prisma.JsonValue | null;
  disposition: string;
};
@Injectable()
export class ImportValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly archiveWriter: ImportArchiveWriter,
    private readonly events: ImportLifecycleEventsService,
  ) {}
  async validate(access: AccessContext, batchId: string) {
    const batch = await this.prisma.importBatch.findFirst({
      where: { id: batchId, organizationId: access.organizationId },
    });
    if (!batch)
      throw new NotFoundException({
        code: 'IMPORT_BATCH_NOT_FOUND',
        messageKey: 'imports.batchNotFound',
      });
    const sourceIds = (
      await this.prisma.importSourceFile.findMany({
        where: { organizationId: access.organizationId, batchId },
        select: { id: true },
      })
    ).map((source) => source.id);
    const rows = await this.prisma.importRow.findMany({
      where: { organizationId: access.organizationId, sourceFileId: { in: sourceIds } },
      orderBy: [{ sheetName: 'asc' }, { rowNumber: 'asc' }],
    });
    await this.prisma.$transaction(
      async (transaction) => {
        await this.archiveWriter.archive(transaction, access, batchId, rows);
        await transaction.importIssue.deleteMany({
          where: { organizationId: access.organizationId, batchId, status: 'OPEN' },
        });
        const masters = await this.validateMasters(transaction, access, batchId, rows);
        await this.validateImportedMasterEvidence(transaction, access, batchId, rows);
        const calendarCohorts = await this.validateCalendar(transaction, access, batchId, rows);
        await this.validateAttendance(
          transaction,
          access,
          batchId,
          rows,
          masters,
          new Set(
            [...masters.map((master) => master.cohortCode), ...calendarCohorts].map((code) =>
              code.trim().toUpperCase(),
            ),
          ),
        );
        await transaction.importBatch.update({
          where: { id: batchId },
          data: { status: 'VALIDATED' },
        });
        await this.events.validated(transaction, access.organizationId, batchId);
      },
      { maxWait: 10000, timeout: 120000 },
    );
    return this.summary(access.organizationId, batchId, sourceIds);
  }
  private async validateMasters(
    transaction: Prisma.TransactionClient,
    access: AccessContext,
    batchId: string,
    rows: Row[],
  ): Promise<MasterValue[]> {
    const enrollmentKeys = new Map<string, number>();
    const legacyCodes = new Map<string, number>();
    const importedMasters = rows
      .filter((row) => row.sheetName === 'Master Sheet' && row.disposition === 'IMPORTED')
      .map((row) => asObject<MasterValue>(row.normalizedValues));
    const candidateRows = rows.filter(
      (row) =>
        row.sheetName === 'Master Sheet' &&
        row.rowNumber > 3 &&
        !['ARCHIVED', 'IMPORTED'].includes(row.disposition),
    );
    const pairs = candidateRows.map((row) => ({
      row,
      value: parseMaster(asObject<Record<string, XlsxScalar>>(row.rawValues)),
    }));
    const emptyRows = pairs.filter(({ value }) => !meaningfulMaster(value));
    await this.archiveHeaders(
      transaction,
      emptyRows.map(({ row }) => row),
    );
    const dataRows = pairs.filter(({ value }) => meaningfulMaster(value));
    const readyMasters: MasterValue[] = [...importedMasters];
    for (const value of [...importedMasters, ...dataRows.map((entry) => entry.value)]) {
      const key = masterEnrollmentKey(value);
      enrollmentKeys.set(key, (enrollmentKeys.get(key) ?? 0) + 1);
      const legacyCode = value.legacyCode.trim().toUpperCase();
      if (legacyCode) legacyCodes.set(legacyCode, (legacyCodes.get(legacyCode) ?? 0) + 1);
    }
    for (const { row, value } of dataRows) {
      const errors = sourceErrors(row.rawValues, new Set(['E']));
      if (!value.legacyCode) errors.push('MASTER_CODE_REQUIRED');
      if (!value.name) errors.push('STUDENT_NAME_REQUIRED');
      if (!value.cohortCode || !value.programCode) errors.push('ACADEMIC_LINK_REQUIRED');
      errors.push(...masterFinancialIssues(value));
      if (value.legacyCode && (enrollmentKeys.get(masterEnrollmentKey(value)) ?? 0) > 1)
        errors.push('DUPLICATE_LEGACY_ENROLLMENT');
      if ((legacyCodes.get(value.legacyCode.trim().toUpperCase()) ?? 0) > 1)
        errors.push('PERSON_IDENTITY_REVIEW_REQUIRED');
      await saveRowValidation(transaction, access, batchId, row.id, value, errors);
      if (errors.length === 0) readyMasters.push(value);
    }
    await this.archiveHeaders(
      transaction,
      rows.filter((row) => row.sheetName === 'Master Sheet' && row.rowNumber <= 3),
    );
    return readyMasters;
  }
  private async validateImportedMasterEvidence(
    transaction: Prisma.TransactionClient,
    access: AccessContext,
    batchId: string,
    rows: Row[],
  ): Promise<void> {
    const importedRows = rows.filter(
      (row) => row.sheetName === 'Master Sheet' && row.disposition === 'IMPORTED',
    );
    for (const row of importedRows) {
      const parsed = parseMaster(asObject<Record<string, XlsxScalar>>(row.rawValues));
      const evidence = parsed.paymentEvidenceIssues ?? [];
      const codes = [...new Set(evidence.flatMap((issue) => issue.codes))];
      for (const code of codes) {
        await transaction.importIssue.create({
          data: {
            organizationId: access.organizationId,
            batchId,
            importRowId: row.id,
            severity: 'CRITICAL',
            code,
            message: code,
            details: {
              ruleVersion: 1,
              paymentEvidenceIssues: evidence,
              rule: 'This historical row was already imported. Never infer or post a missing legacy payment date or method; reconcile it with a Data Steward.',
              importedTargetPreserved: true,
            },
          },
        });
      }
    }
  }
  private async validateAttendance(
    transaction: Prisma.TransactionClient,
    access: AccessContext,
    batchId: string,
    rows: Row[],
    masters: MasterValue[],
    availableCohorts: Set<string>,
  ): Promise<void> {
    const candidateRows = rows.filter(
      (row) =>
        row.sheetName === 'Attendance & Cert.' &&
        row.rowNumber > 1 &&
        !['ARCHIVED', 'IMPORTED'].includes(row.disposition),
    );
    const pairs = candidateRows.map((row) => ({
      row,
      value: parseAttendance(asObject<Record<string, XlsxScalar>>(row.rawValues)),
    }));
    await this.archiveHeaders(
      transaction,
      pairs.filter(({ value }) => !meaningfulAttendance(value)).map(({ row }) => row),
    );
    const dataRows = pairs.filter(({ value }) => meaningfulAttendance(value));
    const importedValues = rows
      .filter((row) => row.sheetName === 'Attendance & Cert.' && row.disposition === 'IMPORTED')
      .map((row) => asObject<ReturnType<typeof parseAttendance>>(row.normalizedValues));
    const allValues = [...importedValues, ...dataRows.map(({ value }) => value)];
    const attendanceErrors = prepareAttendanceRows(allValues);
    const links = attendanceLinks(allValues, masters);
    for (const { row, value } of dataRows) {
      const errors = [
        ...sourceErrors(row.rawValues, new Set(['C'])),
        ...(attendanceErrors.get(value) ?? []),
      ];
      if (!value.name) errors.push('STUDENT_NAME_REQUIRED');
      if (!value.cohortCode) errors.push('COHORT_REQUIRED');
      if (!attendanceCohortsAvailable(value, availableCohorts))
        errors.push('ATTENDANCE_COHORT_MAPPING_REQUIRED');
      const matchCount = links.matchCounts.get(value) ?? 0;
      if (matchCount !== 1)
        errors.push(matchCount ? 'AMBIGUOUS_MASTER_STUDENT' : 'MASTER_STUDENT_NOT_FOUND');
      if (links.duplicateTargets.has(value)) errors.push('DUPLICATE_ATTENDANCE_TARGET');
      await saveRowValidation(transaction, access, batchId, row.id, value, errors);
    }
    await this.archiveHeaders(
      transaction,
      rows.filter((row) => row.sheetName === 'Attendance & Cert.' && row.rowNumber <= 1),
    );
  }
  private async validateCalendar(
    transaction: Prisma.TransactionClient,
    access: AccessContext,
    batchId: string,
    rows: Row[],
  ): Promise<Set<string>> {
    const candidateRows = rows.filter(
      (row) =>
        row.sheetName.startsWith('Annual Calendar') &&
        row.rowNumber > 3 &&
        !['ARCHIVED', 'IMPORTED'].includes(row.disposition),
    );
    const pairs = candidateRows.map((row) => ({
      row,
      value: parseCalendar(asObject<Record<string, XlsxScalar>>(row.rawValues), row.sheetName),
    }));
    await this.archiveHeaders(
      transaction,
      pairs
        .filter(({ value }) => !value.programName && !value.cohortCode && !value.moduleName)
        .map(({ row }) => row),
    );
    const dataRows = pairs.filter(
      ({ value }) => value.programName || value.cohortCode || value.moduleName,
    );
    const importedValues = rows
      .filter(
        (row) => row.sheetName.startsWith('Annual Calendar') && row.disposition === 'IMPORTED',
      )
      .map((row) => asObject<ReturnType<typeof parseCalendar>>(row.normalizedValues));
    const conflicts = calendarConflictKeys([
      ...importedValues,
      ...dataRows.map(({ value }) => value),
    ]);
    const readyCohorts = new Set(importedValues.map((value) => value.cohortCode));
    for (const { row, value } of dataRows) {
      const errors = sourceErrors(row.rawValues);
      if (!value.programName || !value.cohortCode || !value.moduleName)
        errors.push('CALENDAR_ACADEMIC_FIELDS_REQUIRED');
      if (!Number.isInteger(value.sessionOrdinal) || value.sessionOrdinal < 1)
        errors.push('SESSION_ORDINAL_INVALID');
      if (!value.startsAt || !value.endsAt || value.endsAt <= value.startsAt)
        errors.push('SESSION_TIME_INVALID');
      if (conflicts.sessions.has(`${value.cohortCode}|${value.sessionOrdinal}`))
        errors.push('CALENDAR_SESSION_DUPLICATE');
      if (conflicts.rooms.has(`${value.roomCode}|${value.startsAt}|${value.endsAt}`))
        errors.push('CALENDAR_ROOM_CONFLICT');
      const trainerConflict = value.trainerName
        .split(/\\|\/|,/)
        .some((name) => conflicts.trainers.has(`${name.trim()}|${value.startsAt}|${value.endsAt}`));
      if (trainerConflict) errors.push('CALENDAR_TRAINER_CONFLICT');
      await saveRowValidation(transaction, access, batchId, row.id, value, errors);
      if (!errors.length) readyCohorts.add(value.cohortCode);
    }
    await this.archiveHeaders(
      transaction,
      rows.filter((row) => row.sheetName.startsWith('Annual Calendar') && row.rowNumber <= 3),
    );
    return readyCohorts;
  }
  private async archiveHeaders(transaction: Prisma.TransactionClient, rows: Row[]): Promise<void> {
    if (!rows.length) return;
    await transaction.importRow.updateMany({
      where: { id: { in: rows.map((row) => row.id) } },
      data: { disposition: 'ARCHIVED' },
    });
  }
  private async summary(organizationId: string, batchId: string, sourceIds: string[]) {
    const grouped = await this.prisma.importRow.groupBy({
      by: ['disposition'],
      where: { organizationId, sourceFileId: { in: sourceIds } },
      _count: { _all: true },
    });
    return {
      batchId,
      dispositions: Object.fromEntries(
        grouped.map((group) => [group.disposition, group._count._all]),
      ),
      openIssues: await this.prisma.importIssue.count({
        where: { organizationId, batchId, status: 'OPEN' },
      }),
    };
  }
}
