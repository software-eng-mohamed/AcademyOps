import type { AttendanceStatus } from './states.js';

export type AttendanceFact = {
  recordId: string;
  status: AttendanceStatus;
};

export type MakeupCredit = {
  missedRecordId: string;
  makeupRecordId: string;
};

export type AttendanceRatio = {
  numerator: number;
  denominator: number;
  ratio: number | null;
};

// Attendance ratio calculation:
// - EXCUSED and UNMARKED do not count toward the denominator.
// - An ABSENT record is compensated if matched with an attended makeup session.
export function calculateAttendanceRatio(
  records: readonly AttendanceFact[],
  makeupCredits: readonly MakeupCredit[] = [],
): AttendanceRatio {
  const byId = new Map(records.map((record) => [record.recordId, record]));
  const compensated = new Set<string>();

  for (const credit of makeupCredits) {
    const missed = byId.get(credit.missedRecordId);
    const makeup = byId.get(credit.makeupRecordId);
    if (
      missed?.status === 'ABSENT' &&
      (makeup?.status === 'PRESENT' || makeup?.status === 'LATE') &&
      !compensated.has(credit.missedRecordId)
    ) {
      compensated.add(credit.missedRecordId);
    }
  }

  let numerator = 0;
  let denominator = 0;
  for (const record of records) {
    if (record.status === 'UNMARKED' || record.status === 'EXCUSED') continue;
    denominator += 1;
    if (
      record.status === 'PRESENT' ||
      record.status === 'LATE' ||
      compensated.has(record.recordId)
    ) {
      numerator += 1;
    }
  }

  return { numerator, denominator, ratio: denominator === 0 ? null : numerator / denominator };
}
