import type { AttendanceRowValue, MasterValue } from './import-values';
export function personMatches(attendance: AttendanceRowValue, master: MasterValue): boolean {
  if (attendance.cohortCode.toUpperCase() !== master.cohortCode.toUpperCase()) return false;
  if (attendance.phone && master.phone && attendance.phone === master.phone) return true;
  if (attendance.email && master.email && attendance.email === master.email) return true;
  return Boolean(attendance.name && attendance.name.toUpperCase() === master.name.toUpperCase());
}
export const meaningfulMaster = (value: MasterValue): boolean =>
  Boolean(value.legacyCode || value.name || value.phone || value.email || value.cohortCode);
export const meaningfulAttendance = (value: AttendanceRowValue): boolean =>
  [value.name, value.phone, value.email, value.cohortCode].some((entry) =>
    Boolean(entry && entry.trim() !== '0' && !entry.trim().startsWith('#')),
  );
export function attendanceLinks(values: AttendanceRowValue[], masters: MasterValue[]) {
  const matchCounts = new Map<AttendanceRowValue, number>();
  const targetCounts = new Map<string, number>();
  for (const value of values) {
    const matches = masters.filter((master) => personMatches(value, master));
    matchCounts.set(value, matches.length);
    if (matches.length !== 1) continue;
    value.masterLegacyCode = matches[0]!.legacyCode;
    value.deliveryMode = matches[0]!.deliveryMode;
    for (const mark of value.attendance) {
      const key = attendanceTargetKey(value, mark.cohortCode, mark.ordinal);
      targetCounts.set(key, (targetCounts.get(key) ?? 0) + 1);
    }
  }
  const duplicateTargets = new Set(
    values.filter(
      (value) =>
        value.masterLegacyCode &&
        value.attendance.some(
          (mark) =>
            (targetCounts.get(attendanceTargetKey(value, mark.cohortCode, mark.ordinal)) ?? 0) > 1,
        ),
    ),
  );
  return { matchCounts, duplicateTargets };
}
export const attendanceCohortsAvailable = (
  value: AttendanceRowValue,
  available: Set<string>,
): boolean =>
  value.attendance.every(
    (mark) =>
      available.has(mark.cohortCode.trim().toUpperCase()) ||
      mark.cohortCode.trim().toUpperCase() === value.cohortCode.trim().toUpperCase(),
  );
const attendanceTargetKey = (value: AttendanceRowValue, cohortCode: string, ordinal: number) =>
  `${value.masterLegacyCode!.trim().toUpperCase()}|${value.cohortCode.trim().toUpperCase()}|${cohortCode.trim().toUpperCase()}|${ordinal}`;
