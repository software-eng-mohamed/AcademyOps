import { describe, expect, it } from 'vitest';
import {
  calendarConflictKeys,
  masterFinancialIssues,
  sourceErrors,
} from '../src/imports/import-validation-errors';
import {
  parseCalendar,
  parseMaster,
  type CalendarValue,
  type MasterValue,
} from '../src/imports/import-values';
const calendar = (overrides: Partial<CalendarValue>): CalendarValue => ({
  programName: 'Program',
  programCode: 'PROGRAM',
  cohortCode: 'GROUP-1',
  sessionOrdinal: 1,
  moduleName: 'Module',
  trainerName: 'Trainer A',
  sourceWallStart: '2026-01-02T11:00:00',
  sourceWallEnd: '2026-01-02T14:00:00',
  startsAt: '2026-01-02T09:00:00.000Z',
  endsAt: '2026-01-02T12:00:00.000Z',
  roomCode: 'ROOM-1',
  deliveryMode: 'IN_PERSON',
  ...overrides,
});
describe('import validation safeguards', () => {
  it('detects room and trainer collisions independently of cohort identity', () => {
    const conflicts = calendarConflictKeys([
      calendar({}),
      calendar({ cohortCode: 'GROUP-2', sessionOrdinal: 2 }),
    ]);
    expect(conflicts.rooms).toContain('ROOM-1|2026-01-02T09:00:00.000Z|2026-01-02T12:00:00.000Z');
    expect(conflicts.trainers).toContain(
      'Trainer A|2026-01-02T09:00:00.000Z|2026-01-02T12:00:00.000Z',
    );
    expect(conflicts.sessions.size).toBe(0);
  });
  it('detects partial and nested overlaps but permits boundary-touching sessions', () => {
    const conflicts = calendarConflictKeys([
      calendar({ startsAt: '2026-01-02T09:00:00.000Z', endsAt: '2026-01-02T12:00:00.000Z' }),
      calendar({
        cohortCode: 'G2',
        startsAt: '2026-01-02T10:00:00.000Z',
        endsAt: '2026-01-02T11:00:00.000Z',
      }),
      calendar({
        cohortCode: 'G3',
        startsAt: '2026-01-02T12:00:00.000Z',
        endsAt: '2026-01-02T13:00:00.000Z',
      }),
    ]);
    expect(conflicts.rooms).toContain('ROOM-1|2026-01-02T10:00:00.000Z|2026-01-02T11:00:00.000Z');
    expect(conflicts.rooms).not.toContain(
      'ROOM-1|2026-01-02T12:00:00.000Z|2026-01-02T13:00:00.000Z',
    );
  });
  it('interprets calendar wall-clock values in Cairo including DST and year rollover', () => {
    const value = (date: string) => ({
      B: 'Program',
      C: 'TST 1',
      D: 'S1',
      E: 'Module',
      G: date,
      J: 0.625,
      K: 0.75,
    });
    expect(parseCalendar(value('Fri-02-Jan'), 'Annual Calendar - 2026').startsAt).toBe(
      '2026-01-02T13:00:00.000Z',
    );
    expect(parseCalendar(value('Fri-02-Jan'), 'Annual Calendar - 2026').sourceWallStart).toBe(
      '2026-01-02T15:00:00',
    );
    expect(parseCalendar(value('Fri-03-Jul'), 'Annual Calendar - 2026').startsAt).toBe(
      '2026-07-03T12:00:00.000Z',
    );
    expect(parseCalendar(value('Fri-26-Dec'), 'Annual Calendar - 2026').startsAt).toBe(
      '2025-12-26T13:00:00.000Z',
    );
  });
  it('preserves the calendar coordinator as source evidence', () => {
    const value = parseCalendar(
      {
        B: 'Program',
        C: 'TST 1',
        D: 'S1',
        E: 'Module',
        G: 'Fri-02-Jan',
        J: 0.625,
        K: 0.75,
        L: 'Mahmoud Essam',
      },
      'Annual Calendar - 2026',
    );
    expect(value.coordinatorName).toBe('Mahmoud Essam');
  });
  it('handles undefined JSON children and ignores optional source columns safely', () => {
    expect(sourceErrors({ A: { formula: '1/0', value: '#DIV/0!' }, B: null })).toEqual([
      'SOURCE__DIV_0_',
    ]);
    expect(sourceErrors({ A: { formula: '1/0', value: '#DIV/0!' } }, new Set(['A']))).toEqual([]);
  });
  it('quarantines payments whose source price is missing', () => {
    const value: MasterValue = {
      legacyCode: '010303601',
      state: 'Active',
      name: 'Paid student',
      phone: null,
      email: null,
      kind: 'Individual',
      branch: 'Maadi',
      deliveryMode: 'IN_PERSON',
      programCode: 'TST',
      cohortCode: 'TST 1',
      subtotal: 0,
      discountAmount: 0,
      totalAmount: 0,
      paidAmount: 500,
      payments: [{ amount: 500, method: 'Cash', receivedAt: '2026-01-02T00:00:00.000Z' }],
    };
    expect(masterFinancialIssues(value)).toContain('PRICING_TOTAL_MISSING_WITH_PAYMENT');
  });
  it('quarantines positive payments until both date and method are present', () => {
    const value = parseMaster({
      A: '010303601',
      D: 'Paid student',
      M: 'TST',
      N: 'TST 1',
      O: 1000,
      Q: 1000,
      T: 500,
      U: 300,
      V: 'Cash',
      X: 200,
      Z: 45000,
    });
    expect(value.payments).toEqual([]);
    expect(value.paymentEvidenceIssues).toEqual([
      {
        ordinal: 1,
        amount: 300,
        method: 'Cash',
        receivedAt: '',
        codes: ['PAYMENT_DATE_REQUIRED'],
      },
      {
        ordinal: 2,
        amount: 200,
        method: '',
        receivedAt: '45000',
        codes: ['PAYMENT_METHOD_REQUIRED'],
      },
    ]);
    expect(masterFinancialIssues(value)).toEqual(
      expect.arrayContaining([
        'PAYMENT_DATE_REQUIRED',
        'PAYMENT_METHOD_REQUIRED',
        'PAYMENT_BREAKDOWN_MISMATCH',
      ]),
    );
  });
  it('reads legacy dotted payment dates as day-month-year', () => {
    const value = parseMaster({
      A: '010303602',
      D: 'Legacy dotted date',
      M: 'TST',
      N: 'TST 1',
      O: 1000,
      Q: 1000,
      T: 500,
      U: 500,
      V: 'Cash',
      W: '17.08.2024',
    });
    expect(value.paymentEvidenceIssues).toEqual([]);
    expect(value.payments).toEqual([
      {
        amount: 500,
        method: 'Cash',
        receivedAt: '2024-08-17T00:00:00.000Z',
        sourceOrdinal: 1,
      },
    ]);
  });
});
