import type { AttendanceRowValue, CalendarValue } from './import-values';
import {
  array,
  object,
  exactKeys,
  text,
  requiredText,
  nullableText,
  integer,
  ratio,
  oneOf,
  iso,
  invalid,
} from './import-correction-primitives';

export function attendance(input: Record<string, unknown>): AttendanceRowValue {
  exactKeys(
    input,
    [
      'name',
      'phone',
      'email',
      'cohortCode',
      'programCode',
      'masterLegacyCode',
      'deliveryMode',
      'attendanceRatio',
      'applicableSessionCount',
      'certificateStatus',
      'attendance',
      'sourceFormulaMaxOrdinal',
    ],
    'correction.values',
  );
  const marks = array(input.attendance, 'attendance').map((value, index) => {
    const mark = object(value, `attendance.${index}`);
    exactKeys(
      mark,
      ['ordinal', 'cohortCode', 'status', 'sourceMarkColumn', 'sourceCohortColumn'],
      `attendance.${index}`,
    );
    return {
      ordinal: integer(mark.ordinal, `attendance.${index}.ordinal`, 1, 28),
      cohortCode: requiredText(mark.cohortCode, `attendance.${index}.cohortCode`),
      status: oneOf(
        mark.status,
        ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'],
        `attendance.${index}.status`,
      ),
      ...(mark.sourceMarkColumn === undefined
        ? {}
        : { sourceMarkColumn: requiredText(mark.sourceMarkColumn, 'sourceMarkColumn') }),
      ...(mark.sourceCohortColumn === undefined
        ? {}
        : { sourceCohortColumn: requiredText(mark.sourceCohortColumn, 'sourceCohortColumn') }),
    };
  });
  const markKeys = marks.map((mark) => `${mark.cohortCode.toUpperCase()}|${mark.ordinal}`);
  if (new Set(markKeys).size !== markKeys.length) invalid('attendance', 'Attendance slots repeat');
  return {
    name: requiredText(input.name, 'name'),
    phone: nullableText(input.phone, 'phone'),
    email: nullableText(input.email, 'email'),
    cohortCode: requiredText(input.cohortCode, 'cohortCode'),
    programCode: requiredText(input.programCode, 'programCode'),
    ...(input.masterLegacyCode === undefined
      ? {}
      : { masterLegacyCode: requiredText(input.masterLegacyCode, 'masterLegacyCode') }),
    ...(input.deliveryMode === undefined
      ? {}
      : {
          deliveryMode: oneOf(
            input.deliveryMode,
            ['IN_PERSON', 'ONLINE', 'HYBRID'],
            'deliveryMode',
          ),
        }),
    attendanceRatio: ratio(input.attendanceRatio),
    ...(input.applicableSessionCount === undefined
      ? {}
      : {
          applicableSessionCount: integer(
            input.applicableSessionCount,
            'applicableSessionCount',
            1,
            28,
          ),
        }),
    certificateStatus: text(input.certificateStatus, 'certificateStatus'),
    attendance: marks,
    ...(input.sourceFormulaMaxOrdinal === undefined
      ? {}
      : {
          sourceFormulaMaxOrdinal: integer(
            input.sourceFormulaMaxOrdinal,
            'sourceFormulaMaxOrdinal',
            1,
            28,
          ),
        }),
  };
}

export function calendar(input: Record<string, unknown>): CalendarValue {
  exactKeys(
    input,
    [
      'programName',
      'programCode',
      'cohortCode',
      'sessionOrdinal',
      'moduleName',
      'trainerName',
      'sourceWallStart',
      'sourceWallEnd',
      'startsAt',
      'endsAt',
      'roomCode',
      'deliveryMode',
      'coordinatorName',
    ],
    'correction.values',
  );
  const startsAt = iso(input.startsAt, 'startsAt');
  const endsAt = iso(input.endsAt, 'endsAt');
  return {
    programName: requiredText(input.programName, 'programName'),
    programCode: requiredText(input.programCode, 'programCode'),
    cohortCode: requiredText(input.cohortCode, 'cohortCode'),
    sessionOrdinal: integer(input.sessionOrdinal, 'sessionOrdinal', 1, 1000),
    moduleName: requiredText(input.moduleName, 'moduleName'),
    trainerName: text(input.trainerName, 'trainerName'),
    sourceWallStart: requiredText(input.sourceWallStart, 'sourceWallStart'),
    sourceWallEnd: requiredText(input.sourceWallEnd, 'sourceWallEnd'),
    startsAt,
    endsAt,
    roomCode: text(input.roomCode, 'roomCode'),
    deliveryMode: oneOf(input.deliveryMode, ['IN_PERSON', 'ONLINE', 'HYBRID'], 'deliveryMode'),
    ...(input.coordinatorName === undefined
      ? {}
      : { coordinatorName: text(input.coordinatorName, 'coordinatorName') }),
  };
}
