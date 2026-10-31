import { master } from './import-correction-master';
import { attendance, calendar } from './import-correction-schedule';
import { object, requiredString, exactKeys, uuid, invalid } from './import-correction-primitives';
import type { Prisma } from '@prisma/client';
import { attendanceCohortsAvailable, attendanceLinks } from './import-row-matching';
import { prepareAttendanceRows } from './import-attendance-validation';
import {
  calendarConflictKeys,
  masterFinancialIssues,
  sourceErrors,
} from './import-validation-errors';
import type { AttendanceRowValue, CalendarValue, MasterValue } from './import-values';
import { masterEnrollmentKey } from './import-values';

export const IMPORT_CORRECTION_SCHEMA = 'plg-import-correction/v1' as const;
export const IMPORT_ISSUE_RULE_VERSION = 1 as const;

export type ImportCorrectionRow = {
  id: string;
  sheetName: string;
  rowNumber: number;
  rowHash: string;
  rawValues: Prisma.JsonValue;
  normalizedValues: Prisma.JsonValue | null;
  disposition: string;
};

export type RowValuesCorrection = {
  kind: 'ROW_VALUES';
  values: Record<string, unknown>;
};

export type PersonMappingCorrection =
  | { kind: 'PERSON_MAPPING'; action: 'MATCH_EXISTING'; personId: string }
  | { kind: 'PERSON_MAPPING'; action: 'CREATE_NEW' };

export type ImportCorrection = RowValuesCorrection | PersonMappingCorrection;

export function parseImportCorrection(value: unknown): ImportCorrection {
  const input = object(value, 'correction');
  const kind = requiredString(input.kind, 'correction.kind');
  if (kind === 'ROW_VALUES') {
    exactKeys(input, ['kind', 'values'], 'correction');
    return { kind, values: object(input.values, 'correction.values') };
  }
  if (kind === 'PERSON_MAPPING') {
    const action = requiredString(input.action, 'correction.action');
    if (action === 'MATCH_EXISTING') {
      exactKeys(input, ['kind', 'action', 'personId'], 'correction');
      const personId = requiredString(input.personId, 'correction.personId');
      if (!uuid(personId)) invalid('correction.personId');
      return { kind, action, personId };
    }
    if (action === 'CREATE_NEW') {
      exactKeys(input, ['kind', 'action'], 'correction');
      return { kind, action };
    }
  }
  invalid('correction.kind');
}

export function parseCorrectedRowValues(
  sheetName: string,
  value: Record<string, unknown>,
): MasterValue | AttendanceRowValue | CalendarValue {
  if (sheetName === 'Master Sheet') return master(value);
  if (sheetName === 'Attendance & Cert.') return attendance(value);
  if (sheetName.startsWith('Annual Calendar')) return calendar(value);
  invalid('correction.values', 'Unsupported worksheet');
}

export function correctionValidationCodes(
  rows: ImportCorrectionRow[],
  targetRowId: string,
  corrected: MasterValue | AttendanceRowValue | CalendarValue,
): string[] {
  const target = rows.find((row) => row.id === targetRowId);
  if (!target) invalid('expectedRowHash', 'The import row is no longer available');
  const active = rows.filter(
    (row) => row.id === targetRowId || !['ARCHIVED', 'IMPORTED'].includes(row.disposition),
  );
  const normalized = (row: ImportCorrectionRow) =>
    row.id === targetRowId ? corrected : row.normalizedValues;

  if (target.sheetName === 'Master Sheet') {
    const masters = active
      .filter((row) => row.sheetName === 'Master Sheet' && normalized(row))
      .map((row) => normalized(row) as unknown as MasterValue);
    const value = corrected as MasterValue;
    const enrollmentCount = masters.filter(
      (entry) => masterEnrollmentKey(entry) === masterEnrollmentKey(value),
    ).length;
    const legacyCodeCount = value.legacyCode
      ? masters.filter(
          (entry) =>
            entry.legacyCode.trim().toUpperCase() === value.legacyCode.trim().toUpperCase(),
        ).length
      : 0;
    const errors = sourceErrors(target.rawValues, new Set(['E']));
    if (!value.legacyCode) errors.push('MASTER_CODE_REQUIRED');
    if (!value.name) errors.push('STUDENT_NAME_REQUIRED');
    if (!value.cohortCode || !value.programCode) errors.push('ACADEMIC_LINK_REQUIRED');
    errors.push(...masterFinancialIssues(value));
    if (value.legacyCode && enrollmentCount > 1) errors.push('DUPLICATE_LEGACY_ENROLLMENT');
    if (legacyCodeCount > 1) errors.push('PERSON_IDENTITY_REVIEW_REQUIRED');
    return unique(errors);
  }

  if (target.sheetName === 'Attendance & Cert.') {
    const attendanceRows = active
      .filter((row) => row.sheetName === 'Attendance & Cert.' && normalized(row))
      .map((row) => clone(normalized(row) as unknown as AttendanceRowValue));
    const targetIndex = active
      .filter((row) => row.sheetName === 'Attendance & Cert.' && normalized(row))
      .findIndex((row) => row.id === targetRowId);
    const value = attendanceRows[targetIndex];
    if (!value) invalid('correction.values', 'Attendance correction could not be validated');
    const masters = rows
      .filter(
        (row) =>
          row.sheetName === 'Master Sheet' &&
          ['READY', 'IMPORTED'].includes(row.disposition) &&
          row.normalizedValues,
      )
      .map((row) => row.normalizedValues as unknown as MasterValue);
    const calendarCohorts = rows
      .filter(
        (row) =>
          row.sheetName.startsWith('Annual Calendar') &&
          ['READY', 'IMPORTED'].includes(row.disposition) &&
          row.normalizedValues,
      )
      .map((row) => (row.normalizedValues as unknown as CalendarValue).cohortCode);
    const available = new Set(
      [...masters.map((entry) => entry.cohortCode), ...calendarCohorts].map((code) =>
        code.trim().toUpperCase(),
      ),
    );
    const attendanceErrors = prepareAttendanceRows(attendanceRows);
    const links = attendanceLinks(attendanceRows, masters);
    const errors = [
      ...sourceErrors(target.rawValues, new Set(['C'])),
      ...(attendanceErrors.get(value) ?? []),
    ];
    if (!value.name) errors.push('STUDENT_NAME_REQUIRED');
    if (!value.cohortCode) errors.push('COHORT_REQUIRED');
    if (!attendanceCohortsAvailable(value, available))
      errors.push('ATTENDANCE_COHORT_MAPPING_REQUIRED');
    const matchCount = links.matchCounts.get(value) ?? 0;
    if (matchCount !== 1)
      errors.push(matchCount ? 'AMBIGUOUS_MASTER_STUDENT' : 'MASTER_STUDENT_NOT_FOUND');
    if (links.duplicateTargets.has(value)) errors.push('DUPLICATE_ATTENDANCE_TARGET');
    return unique(errors);
  }

  const calendars = active
    .filter((row) => row.sheetName.startsWith('Annual Calendar') && normalized(row))
    .map((row) => normalized(row) as unknown as CalendarValue);
  const value = corrected as CalendarValue;
  const conflicts = calendarConflictKeys(calendars);
  const errors = sourceErrors(target.rawValues);
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
  if (
    value.trainerName
      .split(/\\|\/|,/)
      .some((name) => conflicts.trainers.has(`${name.trim()}|${value.startsAt}|${value.endsAt}`))
  )
    errors.push('CALENDAR_TRAINER_CONFLICT');
  return unique(errors);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
function clone<T>(value: T): T {
  return structuredClone(value);
}
