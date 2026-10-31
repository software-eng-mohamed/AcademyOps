import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { ImportCatalogWriter } from './import-catalog-writer';
import { ratioMatches } from './import-attendance-validation';
import { masterEnrollmentKey, type AttendanceRowValue } from './import-values';

type ImportRow = { id: string; normalizedValues: Prisma.JsonValue | null };

@Injectable()
export class ImportAttendanceWriter {
  constructor(private readonly catalog: ImportCatalogWriter) {}

  async write(
    db: Prisma.TransactionClient,
    access: AccessContext,
    rows: ImportRow[],
  ): Promise<void> {
    for (const row of rows) {
      const value = row.normalizedValues as unknown as AttendanceRowValue;
      if (!value.masterLegacyCode) throw this.conflict('IMPORT_MASTER_LINK_MISSING');
      if (
        !value.applicableSessionCount ||
        value.attendance.length !== value.applicableSessionCount ||
        !ratioMatches(value) ||
        value.attendance.some(
          (mark) => !['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'].includes(mark.status),
        )
      )
        throw this.conflict('IMPORT_ATTENDANCE_RATIO_UNSAFE');
      const enrollmentKey = masterEnrollmentKey({
        legacyCode: value.masterLegacyCode,
        cohortCode: value.cohortCode,
      });
      const enrollmentReference = await db.legacyReference.findFirst({
        where: {
          organizationId: access.organizationId,
          entityType: 'ENROLLMENT',
          sourceField: 'MASTER_ENROLLMENT_KEY',
          rawValue: enrollmentKey,
        },
      });
      if (!enrollmentReference) throw this.conflict('IMPORT_ENROLLMENT_LINK_MISSING');
      const enrollment = await db.enrollment.findFirst({
        where: { organizationId: access.organizationId, id: enrollmentReference.entityId },
      });
      if (!enrollment) throw this.conflict('IMPORT_ENROLLMENT_LINK_MISSING');
      const source = await db.importRow.findFirst({
        where: { organizationId: access.organizationId, id: row.id },
        select: { sourceFileId: true, sheetName: true, rowNumber: true },
      });
      if (!source) throw this.conflict('IMPORT_ATTENDANCE_SOURCE_MISSING');
      for (const mark of value.attendance) {
        const cohort = await db.cohort.findFirst({
          where: { organizationId: access.organizationId, code: mark.cohortCode },
        });
        if (!cohort) throw this.conflict('IMPORT_ATTENDANCE_COHORT_MISSING');
        const session = await this.catalog.ensurePlaceholderSession(
          db,
          access.organizationId,
          cohort.id,
          mark.ordinal,
          value.deliveryMode,
        );
        let record = await db.attendanceRecord.findFirst({
          where: {
            organizationId: access.organizationId,
            sessionId: session.id,
            enrollmentId: enrollment.id,
          },
        });
        if (!record) {
          record = await db.attendanceRecord.create({
            data: {
              organizationId: access.organizationId,
              sessionId: session.id,
              enrollmentId: enrollment.id,
              currentStatus: mark.status,
              source: 'LEGACY_IMPORT',
              recordedAt: session.startsAt ?? new Date(),
              recordedBy: access.actorUserId,
            },
          });
          await db.attendanceEvent.create({
            data: {
              organizationId: access.organizationId,
              attendanceRecordId: record.id,
              version: 1,
              toStatus: mark.status,
              reason: 'Legacy workbook import',
              actorUserId: access.actorUserId,
              occurredAt: session.startsAt ?? new Date(),
            },
          });
        }
        await this.reference(
          db,
          access.organizationId,
          row.id,
          record.id,
          JSON.stringify({
            version: 2,
            sourceFileId: source.sourceFileId,
            sheetName: source.sheetName,
            rowNumber: source.rowNumber,
            sourceOrdinal: mark.ordinal,
            markCell: `${mark.sourceMarkColumn ?? columnName(13 + (mark.ordinal - 1) * 2)}${source.rowNumber}`,
            cohortCell: `${mark.sourceCohortColumn ?? columnName(14 + (mark.ordinal - 1) * 2)}${source.rowNumber}`,
            cohortCode: mark.cohortCode,
            importedStatus: mark.status,
          }),
        );
      }
      if (value.certificateStatus)
        await this.certificateReference(
          db,
          access.organizationId,
          row.id,
          enrollment.id,
          value.certificateStatus,
        );
      await db.importRow.update({
        where: { id: row.id },
        data: { disposition: 'IMPORTED', targetType: 'ENROLLMENT', targetId: enrollment.id },
      });
    }
  }

  private async certificateReference(
    db: Prisma.TransactionClient,
    organizationId: string,
    importRowId: string,
    enrollmentId: string,
    rawValue: string,
  ): Promise<void> {
    const where = {
      organizationId,
      importRowId,
      entityType: 'CERTIFICATE_HISTORY',
      entityId: enrollmentId,
      sourceField: 'CERTIFICATE_STATUS',
      rawValue,
    };
    if (!(await db.legacyReference.findFirst({ where })))
      await db.legacyReference.create({ data: where });
  }

  private async reference(
    db: Prisma.TransactionClient,
    organizationId: string,
    importRowId: string,
    entityId: string,
    rawValue: string,
  ): Promise<void> {
    const where = {
      organizationId,
      importRowId,
      entityType: 'ATTENDANCE',
      entityId,
      sourceField: 'ATTENDANCE_MARK',
      rawValue,
    };
    if (!(await db.legacyReference.findFirst({ where })))
      await db.legacyReference.create({ data: where });
  }

  private conflict(code: string): ConflictException {
    return new ConflictException({ code, messageKey: `imports.${code.toLowerCase()}` });
  }
}

function columnName(index: number): string {
  let value = index;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}
