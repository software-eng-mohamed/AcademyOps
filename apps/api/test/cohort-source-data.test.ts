import { describe, expect, it } from 'vitest';
import {
  deriveCohortScheduleState,
  normalizeCohortSourceCode,
} from '../src/academic/cohort-source-data';

describe('cohort source reconciliation', () => {
  it.each([
    ['HRMD 41', 'HRMD-41'],
    ['HRMD_42', 'hrmd 42'],
    [' HRMD-43 ', 'HRMD43'],
  ])('matches workbook cohort aliases %s and %s', (left, right) => {
    expect(normalizeCohortSourceCode(left)).toBe(normalizeCohortSourceCode(right));
  });

  it('keeps schedule conflicts visible instead of reporting a clean state', () => {
    expect(
      deriveCohortScheduleState(
        new Date('2026-08-01T10:00:00.000Z'),
        new Date('2026-09-01T12:00:00.000Z'),
        2,
        new Date('2026-08-15T10:00:00.000Z'),
      ),
    ).toBe('NEEDS_REVIEW');
  });

  it('does not invent schedule state when the workbook has no schedule', () => {
    expect(deriveCohortScheduleState(null, null, 0)).toBe('NO_SOURCE_SCHEDULE');
  });
});
