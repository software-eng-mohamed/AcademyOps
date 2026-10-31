import { describe, expect, it } from 'vitest';
import {
  correctionValidationCodes,
  parseCorrectedRowValues,
  parseImportCorrection,
  type ImportCorrectionRow,
} from '../src/imports/import-correction-validation';

describe('versioned import correction validation', () => {
  it('rejects unknown fields and incomplete person mappings', () => {
    expect(() =>
      parseImportCorrection({ kind: 'ROW_VALUES', values: {}, ignored: true }),
    ).toThrow();
    expect(() =>
      parseImportCorrection({ kind: 'PERSON_MAPPING', action: 'MATCH_EXISTING' }),
    ).toThrow();
  });

  it('keeps attendance cell provenance while validating editable nested marks', () => {
    const value = parseCorrectedRowValues('Attendance & Cert.', {
      name: 'Student',
      phone: null,
      email: null,
      cohortCode: 'TST 1',
      programCode: 'TST',
      attendanceRatio: 0.5,
      applicableSessionCount: 2,
      sourceFormulaMaxOrdinal: 2,
      certificateStatus: '',
      attendance: [
        {
          ordinal: 1,
          cohortCode: 'TST 1',
          status: 'PRESENT',
          sourceMarkColumn: 'M',
          sourceCohortColumn: 'N',
        },
        {
          ordinal: 2,
          cohortCode: 'TST 1',
          status: 'ABSENT',
          sourceMarkColumn: 'O',
          sourceCohortColumn: 'P',
        },
      ],
    });
    expect(value).toMatchObject({ sourceFormulaMaxOrdinal: 2 });
    expect('attendance' in value ? value.attendance[0] : null).toMatchObject({
      sourceMarkColumn: 'M',
      sourceCohortColumn: 'N',
    });
  });

  it('checks calendar corrections against other rows, not only the edited value', () => {
    const corrected = calendar('G1');
    const rows: ImportCorrectionRow[] = [
      row('target', 'Annual Calendar - 2026', corrected),
      row('other', 'Annual Calendar - 2026', calendar('G2')),
    ];
    expect(correctionValidationCodes(rows, 'target', corrected)).toContain(
      'CALENDAR_ROOM_CONFLICT',
    );
  });

  it('accepts ordinary two-decimal money and rejects fractions of a piastre', () => {
    expect(() => parseCorrectedRowValues('Master Sheet', masterValues(10.29))).not.toThrow();
    expect(() => parseCorrectedRowValues('Master Sheet', masterValues(10.291))).toThrow();
  });
});

function masterValues(totalAmount: number) {
  return {
    legacyCode: 'ST-1',
    state: 'Active',
    name: 'Student',
    phone: null,
    email: null,
    kind: 'Individual',
    branch: 'Main',
    deliveryMode: 'IN_PERSON',
    programCode: 'TST',
    cohortCode: 'TST 1',
    subtotal: totalAmount,
    discountAmount: 0,
    totalAmount,
    paidAmount: 0,
    payments: [],
    paymentEvidenceIssues: [],
  };
}

function calendar(cohortCode: string) {
  return {
    programName: 'Program',
    programCode: 'TST',
    cohortCode,
    sessionOrdinal: 1,
    moduleName: 'Module',
    trainerName: '',
    sourceWallStart: '2026-01-01T09:00:00',
    sourceWallEnd: '2026-01-01T10:00:00',
    startsAt: '2026-01-01T07:00:00.000Z',
    endsAt: '2026-01-01T08:00:00.000Z',
    roomCode: 'ROOM-1',
    deliveryMode: 'IN_PERSON',
  };
}

function row(
  id: string,
  sheetName: string,
  normalizedValues: Record<string, unknown>,
): ImportCorrectionRow {
  return {
    id,
    sheetName,
    rowNumber: 4,
    rowHash: id.padEnd(64, '0'),
    rawValues: {},
    normalizedValues,
    disposition: 'QUARANTINED',
  };
}
