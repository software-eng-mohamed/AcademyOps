import { describe, expect, it } from 'vitest';
import { prepareAttendanceRows, ratioMatches } from '../src/imports/import-attendance-validation';
import { meaningfulAttendance } from '../src/imports/import-row-matching';
import { parseAttendance } from '../src/imports/import-values';

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

function rawAttendance(ratio: number, present: number, total = 28) {
  const raw: Record<string, string | number | boolean> = {
    B: 'Student',
    E: 'GROUP 1',
    G: 'REG',
    L: ratio,
  };
  for (let ordinal = 1; ordinal <= total; ordinal += 1) {
    raw[columnName(13 + (ordinal - 1) * 2)] = ordinal <= present;
    raw[columnName(14 + (ordinal - 1) * 2)] = 'GROUP 1';
  }
  return raw;
}

describe('legacy attendance denominators', () => {
  it('rejects zero and formula-error placeholder rows as non-data', () => {
    const zero = parseAttendance({ B: 0, C: 0, E: 0, F: 0, G: 0, H: 0 });
    const formulaError = parseAttendance({
      B: { formula: '=Master!D5000', value: '#REF!' },
      C: { formula: '=Master!E5000', value: '#REF!' },
      E: 0,
    });

    expect(meaningfulAttendance(zero)).toBe(false);
    expect(meaningfulAttendance(formulaError)).toBe(false);
  });

  it('preserves sparse source ordinals and their paired columns', () => {
    const raw: Record<string, string | number | boolean | { formula: string; value: number }> = {
      B: 'Student',
      E: 'GROUP 1',
      G: 'REG',
      L: { formula: 'COUNTIF(M9:AZ9,"True")/2', value: 1 },
    };
    raw[columnName(13 + 16 * 2)] = true;
    raw[columnName(14 + 16 * 2)] = 'GROUP 1';
    raw[columnName(13 + 17 * 2)] = true;
    raw[columnName(14 + 17 * 2)] = 'GROUP 1';
    const value = parseAttendance(raw);
    expect(value.applicableSessionCount).toBe(2);
    expect(value.attendance.map((mark) => mark.status)).toEqual(['PRESENT', 'PRESENT']);
    expect(value.attendance.map((mark) => mark.ordinal)).toEqual([17, 18]);
    expect(value.attendance).toMatchObject([
      { sourceMarkColumn: 'AS', sourceCohortColumn: 'AT' },
      { sourceMarkColumn: 'AU', sourceCohortColumn: 'AV' },
    ]);
    expect(prepareAttendanceRows([value]).get(value)).toEqual([]);
  });

  it('quarantines a signed denominator larger than the available mark cells', () => {
    const raw = {
      ...rawAttendance(0.5, 1, 2),
      L: { formula: 'COUNTIF(M9:P9,"True")/4', value: 0.5 },
    };
    const value = parseAttendance(raw);
    expect(prepareAttendanceRows([value]).get(value)).toContain('ATTENDANCE_SESSION_MARKS_MISSING');
  });

  it('does not select or renumber a window merely to reproduce the ratio', () => {
    const value = parseAttendance(rawAttendance(1, 2));
    expect(value).toMatchObject({ applicableSessionCount: 2, attendanceRatio: 1 });
    expect(value.attendance).toHaveLength(28);
    expect(value.attendance.map((mark) => mark.ordinal)).toEqual(
      Array.from({ length: 28 }, (_, index) => index + 1),
    );
    expect(prepareAttendanceRows([value]).get(value)).toContain('ATTENDANCE_SESSION_MARKS_MISSING');
  });

  it('keeps twenty marks for an exact 1/20 ratio', () => {
    const value = parseAttendance({
      ...rawAttendance(0.05, 1, 20),
      L: { formula: 'COUNTIF(M9:AZ9,"True")/20', value: 0.05 },
    });
    expect(value.applicableSessionCount).toBe(20);
    expect(value.attendance).toHaveLength(20);
    expect(ratioMatches(value)).toBe(true);
  });

  it('infers zero-attendance denominators without trimming source marks', () => {
    const signed = parseAttendance({
      ...rawAttendance(0.05, 1, 20),
      L: { formula: 'COUNTIF(M9:AZ9,"True")/20', value: 0.05 },
    });
    const zero = parseAttendance(rawAttendance(0, 0, 20));
    const errors = prepareAttendanceRows([signed, zero]);
    expect(errors.get(zero)).toEqual([]);
    expect(zero.applicableSessionCount).toBe(20);
    expect(zero.attendance).toHaveLength(20);
    expect(zero.attendance.at(-1)?.ordinal).toBe(20);
  });

  it('quarantines zero attendance when cohort denominators conflict', () => {
    const two = parseAttendance({
      ...rawAttendance(1, 2, 2),
      L: { formula: 'COUNTIF(M9:P9,"True")/2', value: 1 },
    });
    const twenty = parseAttendance({
      ...rawAttendance(0.05, 1, 20),
      L: { formula: 'COUNTIF(M9:AZ9,"True")/20', value: 0.05 },
    });
    const zero = parseAttendance(rawAttendance(0, 0, 20));
    const errors = prepareAttendanceRows([two, twenty, zero]);
    expect(errors.get(zero)).toContain('ATTENDANCE_DENOMINATOR_AMBIGUOUS');
  });
});
