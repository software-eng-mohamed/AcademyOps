import type { AttendanceRowValue } from './import-values';

const groupKey = (value: AttendanceRowValue) =>
  `${value.programCode.trim().toUpperCase()}|${value.cohortCode.trim().toUpperCase()}`;

export function prepareAttendanceRows(
  values: AttendanceRowValue[],
): Map<AttendanceRowValue, string[]> {
  const denominators = new Map<string, Set<number>>();
  for (const value of values) {
    if (value.attendanceRatio <= 0 || value.applicableSessionCount === undefined) continue;
    const valuesForGroup = denominators.get(groupKey(value)) ?? new Set<number>();
    valuesForGroup.add(value.applicableSessionCount);
    denominators.set(groupKey(value), valuesForGroup);
  }
  const errors = new Map<AttendanceRowValue, string[]>();
  for (const value of values) {
    const rowErrors: string[] = [];
    const attended = value.attendance.filter(
      (mark) => mark.status === 'PRESENT' || mark.status === 'LATE',
    ).length;
    if (value.attendanceRatio < 0 || value.attendanceRatio > 1)
      rowErrors.push('ATTENDANCE_RATIO_INVALID');
    if (value.attendanceRatio === 0 && value.applicableSessionCount === undefined) {
      if (attended > 0) rowErrors.push('ATTENDANCE_RATIO_INVALID');
      const inferred = [...(denominators.get(groupKey(value)) ?? [])];
      if (inferred.length !== 1) {
        rowErrors.push('ATTENDANCE_DENOMINATOR_AMBIGUOUS');
      } else {
        value.applicableSessionCount = inferred[0]!;
      }
    }
    if (value.attendanceRatio > 0 && value.applicableSessionCount === undefined)
      rowErrors.push('ATTENDANCE_DENOMINATOR_AMBIGUOUS');
    if (
      value.applicableSessionCount !== undefined &&
      value.attendance.length !== value.applicableSessionCount
    )
      rowErrors.push('ATTENDANCE_SESSION_MARKS_MISSING');
    if (
      value.sourceFormulaMaxOrdinal !== undefined &&
      value.attendance.some((mark) => mark.ordinal > value.sourceFormulaMaxOrdinal!)
    )
      rowErrors.push('ATTENDANCE_SOURCE_RANGE_CONFLICT');
    if (value.applicableSessionCount !== undefined && !ratioMatches(value))
      rowErrors.push('ATTENDANCE_RATIO_MISMATCH');
    errors.set(value, rowErrors);
  }
  return errors;
}

export function ratioMatches(value: AttendanceRowValue, tolerance = 0.005): boolean {
  if (!value.applicableSessionCount) return false;
  const attended = value.attendance.filter(
    (mark) => mark.status === 'PRESENT' || mark.status === 'LATE',
  ).length;
  return Math.abs(attended / value.applicableSessionCount - value.attendanceRatio) <= tolerance;
}
