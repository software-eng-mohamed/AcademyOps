import type * as M from './attendance-models.js';
import { PlgApiError } from './errors.js';

const VALID_SESSION_STATUSES = new Set(['DRAFT', 'SCHEDULED', 'COMPLETED', 'CANCELLED']);
const VALID_WINDOW_STATES = new Set(['SCHEDULED', 'OPEN', 'CLOSED', 'LOCKED']);
const VALID_ATTENDANCE_STATUSES = new Set(['UNMARKED', 'PRESENT', 'LATE', 'ABSENT', 'EXCUSED']);

function invalidResponse(reason: string): never {
  console.error(`Invalid response: ${reason}`);
  throw new PlgApiError(500, {
    code: 'RESPONSE_INVALID',
    messageKey: 'errors.requestFailed',
  });
}

function isObj(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export function validateAttendanceRosterPage(data: unknown): M.AttendanceRosterPage {
  if (!isObj(data)) invalidResponse('roster page is not an object');
  if (!isObj(data.session)) invalidResponse('roster session is not an object');
  if (
    typeof data.session.id !== 'string' ||
    typeof data.session.status !== 'string' ||
    !VALID_SESSION_STATUSES.has(data.session.status) ||
    typeof data.session.attendanceWindowState !== 'string' ||
    !VALID_WINDOW_STATES.has(data.session.attendanceWindowState) ||
    (data.session.startsAt !== null && typeof data.session.startsAt !== 'string') ||
    (data.session.endsAt !== null && typeof data.session.endsAt !== 'string') ||
    typeof data.session.version !== 'number'
  ) {
    invalidResponse('roster session fields invalid');
  }

  if (!Array.isArray(data.items)) invalidResponse('roster items is not an array');
  if (data.nextCursor !== null && typeof data.nextCursor !== 'string') {
    invalidResponse('roster nextCursor invalid');
  }

  for (const item of data.items) {
    if (
      !isObj(item) ||
      typeof item.enrollmentId !== 'string' ||
      typeof item.effectiveStatus !== 'string' ||
      !VALID_ATTENDANCE_STATUSES.has(item.effectiveStatus)
    ) {
      invalidResponse('roster item invalid');
    }
    if (item.student !== null) {
      const st = item.student;
      if (!isObj(st) || typeof st.id !== 'string' || typeof st.publicId !== 'string') {
        invalidResponse('roster item student invalid');
      }
    }
    if (item.attendance !== null) {
      const att = item.attendance;
      if (
        !isObj(att) ||
        typeof att.id !== 'string' ||
        typeof att.status !== 'string' ||
        !VALID_ATTENDANCE_STATUSES.has(att.status) ||
        typeof att.source !== 'string' ||
        typeof att.recordedAt !== 'string' ||
        typeof att.version !== 'number'
      ) {
        invalidResponse('roster item attendance invalid');
      }
    }
  }

  return data as M.AttendanceRosterPage;
}

export function validateAttendanceMutationResult(data: unknown): M.AttendanceMutationResult {
  if (!isObj(data)) invalidResponse('mutation result is not an object');
  if (
    typeof data.id !== 'string' ||
    typeof data.status !== 'string' ||
    !VALID_ATTENDANCE_STATUSES.has(data.status) ||
    typeof data.version !== 'number'
  ) {
    invalidResponse('mutation result fields invalid');
  }
  return data as M.AttendanceMutationResult;
}

export function validateStableQrTokenResponse(data: unknown): M.StableQrTokenResponse {
  if (!isObj(data) || typeof data.token !== 'string') {
    invalidResponse('stable QR token response invalid');
  }
  return data as M.StableQrTokenResponse;
}

export function validateAttendanceWindowState(data: unknown): {
  id: string;
  state: string;
  version: number;
  rosterCount?: number;
  absentCount?: number;
} {
  if (
    !isObj(data) ||
    typeof data.id !== 'string' ||
    typeof data.state !== 'string' ||
    !VALID_WINDOW_STATES.has(data.state) ||
    typeof data.version !== 'number'
  ) {
    invalidResponse('attendance window state invalid');
  }
  if (data.rosterCount !== undefined && typeof data.rosterCount !== 'number') {
    invalidResponse('attendance window rosterCount invalid');
  }
  if (data.absentCount !== undefined && typeof data.absentCount !== 'number') {
    invalidResponse('attendance window absentCount invalid');
  }
  return data as {
    id: string;
    state: string;
    version: number;
    rosterCount?: number;
    absentCount?: number;
  };
}
