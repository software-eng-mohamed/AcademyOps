import * as attendance from '@/api/generated/attendance/attendance';
import type { CreateAttendancePolicyDto } from '@/api/generated/models/createAttendancePolicyDto';

export async function readAttendanceRecord(id: string, signal?: AbortSignal) {
  return (await attendance.attendanceControllerReadRecordV1(id, { signal: signal ?? null })).data;
}
export async function readAttendanceSummary(enrollmentId: string, signal?: AbortSignal) {
  return (await attendance.attendanceControllerSummaryV1(enrollmentId, { signal: signal ?? null }))
    .data;
}
export async function readAttendanceAnomalies(
  sessionId: string,
  cursor?: string,
  signal?: AbortSignal,
) {
  return (
    await attendance.attendanceControllerAnomaliesV1(
      sessionId,
      { ...(cursor ? { cursor } : {}) },
      { signal: signal ?? null },
    )
  ).data;
}
export async function createSessionChallenge(sessionId: string) {
  return (await attendance.attendanceControllerOpenChallengeV1(sessionId)).data;
}
export async function scanAttendance(
  sessionId: string,
  token: string,
  status: 'PRESENT' | 'LATE',
  key: string,
) {
  if (!token.trim() || token.length > 500) throw new Error('invalidToken');
  return (
    await attendance.attendanceControllerScanV1(
      sessionId,
      { token: token.trim(), status },
      { idempotencyKey: key },
    )
  ).data;
}
export async function createMakeupCredit(
  missedRecordId: string,
  makeupRecordId: string,
  key: string,
) {
  if (!missedRecordId || !makeupRecordId || missedRecordId === makeupRecordId)
    throw new Error('invalidMakeup');
  return (
    await attendance.attendanceControllerMakeupV1(
      { missedRecordId, makeupRecordId },
      { idempotencyKey: key },
    )
  ).data;
}
export async function findSessionAttendance(
  sessionId: string,
  enrollmentId: string,
  signal?: AbortSignal,
) {
  return (await readRosterEntry(sessionId, enrollmentId, signal))?.attendance ?? null;
}
export async function readRosterEntry(
  sessionId: string,
  enrollmentId: string,
  signal?: AbortSignal,
) {
  let cursor: string | undefined;
  const seen = new Set<string>();
  do {
    const page = (
      await attendance.attendanceControllerRosterV1(
        sessionId,
        { ...(cursor ? { cursor } : {}) },
        { signal: signal ?? null },
      )
    ).data;
    const row = page.items.find((item) => item.enrollmentId === enrollmentId);
    if (row) return { ...row, session: page.session };
    cursor = page.nextCursor ?? undefined;
    if (cursor && seen.has(cursor)) throw new Error('Repeated attendance cursor');
    if (cursor) seen.add(cursor);
  } while (cursor);
  return null;
}
export async function readAttendancePolicies(
  programVersionId: string,
  cohortId?: string,
  signal?: AbortSignal,
) {
  return (
    await attendance.attendanceControllerListPoliciesV1(
      { programVersionId, ...(cohortId ? { cohortId } : {}) },
      { signal: signal ?? null },
    )
  ).data.items;
}
type PolicyNumbers =
  | 'minimumRatio'
  | 'lockAfterMinutes'
  | 'checkInOpensBeforeMinutes'
  | 'checkInClosesAfterMinutes';
export type AttendancePolicyInput = Omit<CreateAttendancePolicyDto, PolicyNumbers> &
  Record<PolicyNumbers, number>;
export async function createAttendancePolicy(input: AttendancePolicyInput, key: string) {
  // Generated optional-default number schemas are currently Object. Preserve
  // the numeric HTTP contract within this adapter, without changing the wire data.
  return (
    await attendance.attendanceControllerCreatePolicyV1(
      input as unknown as CreateAttendancePolicyDto,
      { idempotencyKey: key },
    )
  ).data;
}
