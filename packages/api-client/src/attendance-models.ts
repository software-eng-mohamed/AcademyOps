export type SessionStatus = 'DRAFT' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
export type AttendanceWindowState = 'SCHEDULED' | 'OPEN' | 'CLOSED' | 'LOCKED';
export type AttendanceStatus = 'UNMARKED' | 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED';
export type AttendanceRosterItem = {
  enrollmentId: string;
  student: {
    id: string;
    publicId: string;
    name: string | null;
  } | null;
  attendance: {
    id: string;
    status: AttendanceStatus;
    source: string;
    recordedAt: string;
    version: number;
  } | null;
  effectiveStatus: AttendanceStatus;
};
export type AttendanceRosterPage = {
  session: {
    id: string;
    status: SessionStatus;
    attendanceWindowState: AttendanceWindowState;
    startsAt: string | null;
    endsAt: string | null;
    version: number;
  };
  items: AttendanceRosterItem[];
  nextCursor: string | null;
};
export type AttendanceMutationResult = {
  id: string;
  status: AttendanceStatus;
  version: number;
};
export type StableQrTokenResponse = {
  token: string;
};
export type AttendanceQrChallenge = {
  token: string;
  expiresAt: string;
};
export type AttendanceAnomaly = {
  id: string;
  sessionId: string | null;
  challengeId: string | null;
  actorUserId: string;
  reasonCode: string;
  occurredAt: string;
};
export type AttendancePolicy = {
  id: string;
  programVersionId: string;
  cohortId: string | null;
  version: number;
  minimumRatio: string;
  lockAfterMinutes: number;
  checkInOpensBeforeMinutes: number;
  checkInClosesAfterMinutes: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdBy: string;
  createdAt: string;
};
export type CreateAttendancePolicyInput = {
  programVersionId: string;
  cohortId?: string;
  minimumRatio?: number;
  lockAfterMinutes?: number;
  checkInOpensBeforeMinutes?: number;
  checkInClosesAfterMinutes?: number;
  effectiveFrom: string;
  effectiveTo?: string;
};
