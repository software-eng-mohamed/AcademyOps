import type { HttpException } from '@nestjs/common';

export type AttendanceMutationResult = { id: string; status: string; version: number };
export type MakeupMutationResult = { id: string };

export type AnomalyReason =
  | 'MALFORMED_TOKEN'
  | 'CHALLENGE_INVALID_OR_EXPIRED'
  | 'WINDOW_NOT_OPEN'
  | 'STUDENT_CONTEXT_REQUIRED'
  | 'NOT_IN_ROSTER';

export class AttendanceAnomalyError extends Error {
  constructor(
    readonly reasonCode: AnomalyReason,
    readonly response: HttpException,
    readonly challengeId?: string,
    readonly sessionId?: string,
  ) {
    super(reasonCode);
  }
}
