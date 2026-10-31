import { createHash } from 'node:crypto';
import { normalizeEgyptPhone, normalizeEmail, normalizeText } from './normalization';
import type { XlsxScalar } from './xlsx-reader';
export type AttendanceValue = {
  ordinal: number;
  cohortCode: string;
  status: string;
  sourceMarkColumn?: string;
  sourceCohortColumn?: string;
};
export type AttendanceRowValue = {
  name: string;
  phone: string | null;
  email: string | null;
  cohortCode: string;
  programCode: string;
  masterLegacyCode?: string;
  deliveryMode?: string;
  attendanceRatio: number;
  applicableSessionCount?: number;
  certificateStatus: string;
  attendance: AttendanceValue[];
  sourceFormulaMaxOrdinal?: number;
};
export function parseAttendance(raw: Record<string, XlsxScalar>): AttendanceRowValue {
  const allMarks: AttendanceValue[] = [];
  for (let ordinal = 1; ordinal <= 28; ordinal += 1) {
    const sourceMarkColumn = columnName(13 + (ordinal - 1) * 2);
    const sourceCohortColumn = columnName(14 + (ordinal - 1) * 2);
    const mark = scalar(raw[sourceMarkColumn]);
    if (mark === null || mark === '') continue;
    allMarks.push({
      ordinal,
      cohortCode: text(raw[sourceCohortColumn]) || text(raw.E),
      status: attendanceStatus(mark),
      sourceMarkColumn,
      sourceCohortColumn,
    });
  }
  const attendanceRatio = numeric(raw.L);
  const formula = attendanceFormula(raw.L);
  const count = formula.denominator ?? deriveAttendanceSessionCount(allMarks, attendanceRatio);
  return {
    name: text(raw.B),
    cohortCode: text(raw.E),
    phone: normalizeEgyptPhone(scalar(raw.F)),
    programCode: codeFrom(text(raw.G)),
    email: normalizeEmail(scalar(raw.H)),
    attendanceRatio,
    ...(count === null ? {} : { applicableSessionCount: count }),
    certificateStatus: text(raw.D),
    attendance: allMarks,
    ...(formula.maxOrdinal ? { sourceFormulaMaxOrdinal: formula.maxOrdinal } : {}),
  };
}
export function deriveAttendanceSessionCount(
  marks: AttendanceValue[],
  ratio: number,
): number | null {
  if (ratio <= 0) return null;
  const attended = attendedCount(marks);
  const candidates: number[] = [];
  for (let count = Math.max(1, attended); count <= 28; count += 1) {
    const difference = Math.abs(attended / count - ratio);
    if (difference <= 0.005) candidates.push(count);
  }
  return candidates.length === 1 ? candidates[0]! : null;
}
function attendanceFormula(value: XlsxScalar | undefined) {
  if (!value || typeof value !== 'object' || !('formula' in value))
    return { denominator: null, maxOrdinal: null };
  const denominator = Number(/\/\s*(\d+)\s*$/.exec(value.formula)?.[1]);
  const endColumn = /COUNTIF\([^:]+:([A-Z]+)\d+/i.exec(value.formula)?.[1];
  const endIndex = endColumn ? columnIndex(endColumn) : 0;
  return {
    denominator:
      Number.isInteger(denominator) && denominator >= 1 && denominator <= 28 ? denominator : null,
    maxOrdinal: endIndex >= 13 ? Math.floor((endIndex - 13) / 2) + 1 : null,
  };
}
function scalar(value: XlsxScalar | undefined): string | number | boolean | null {
  if (value && typeof value === 'object') return 'formula' in value ? scalar(value.value) : null;
  return value ?? null;
}
const text = (value: XlsxScalar | undefined) => normalizeText(scalar(value)) ?? '';
const numeric = (value: XlsxScalar | undefined) => {
  const parsed = Number(scalar(value));
  return Number.isFinite(parsed) ? parsed : 0;
};
const attendedCount = (marks: AttendanceValue[]) =>
  marks.filter((mark) => mark.status === 'PRESENT' || mark.status === 'LATE').length;
const attendanceStatus = (value: string | number | boolean) => {
  const normalized = String(value).trim().toUpperCase();
  if (normalized === 'L' || normalized === 'LATE') return 'LATE';
  if (normalized === 'E' || normalized === 'EXCUSED') return 'EXCUSED';
  return Number(value) > 0 || normalized === 'PRESENT' ? 'PRESENT' : 'ABSENT';
};
function codeFrom(value: string): string {
  const slug = value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return (slug || `LEGACY-${createHash('sha256').update(value).digest('hex').slice(0, 12)}`).slice(
    0,
    50,
  );
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
const columnIndex = (name: string) =>
  [...name.toUpperCase()].reduce(
    (total, character) => total * 26 + character.charCodeAt(0) - 64,
    0,
  );
