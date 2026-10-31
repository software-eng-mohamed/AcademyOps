import { describe, expect, it } from 'vitest';
import {
  attendanceBand,
  attendanceScore,
  isCountedAttendance,
} from '../src/reporting/dashboard.service';

describe('dashboard attendance metrics', () => {
  it('applies the exact 80% and 85% threshold boundaries', () => {
    expect(attendanceBand(0.7999)).toBe('BELOW_MINIMUM');
    expect(attendanceBand(0.8)).toBe('NEAR_THRESHOLD');
    expect(attendanceBand(0.8499)).toBe('NEAR_THRESHOLD');
    expect(attendanceBand(0.85)).toBe('HEALTHY');
  });

  it('excludes excused and unmarked records from the denominator', () => {
    expect(isCountedAttendance('PRESENT')).toBe(true);
    expect(isCountedAttendance('LATE')).toBe(true);
    expect(isCountedAttendance('ABSENT')).toBe(true);
    expect(isCountedAttendance('EXCUSED')).toBe(false);
    expect(isCountedAttendance('UNMARKED')).toBe(false);
  });

  it('credits an approved makeup only for an absent record', () => {
    expect(attendanceScore('ABSENT', false)).toBe(0);
    expect(attendanceScore('ABSENT', true)).toBe(1);
    expect(attendanceScore('PRESENT', false)).toBe(1);
    expect(attendanceScore('EXCUSED', true)).toBe(0);
  });
});
