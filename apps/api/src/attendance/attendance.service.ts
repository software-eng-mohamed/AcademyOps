import { Injectable } from '@nestjs/common';
import type { AccessContext, AttendanceStatus } from '@academyops/contracts';
import { AttendanceMakeupService } from './attendance-makeup.service';
import { AttendanceQrCheckInService } from './attendance-qr-check-in.service';
import { AttendanceRecordCommandService } from './attendance-record-command.service';
import { AttendanceWindowCommandService } from './attendance-window-command.service';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly windows: AttendanceWindowCommandService,
    private readonly checkIns: AttendanceQrCheckInService,
    private readonly records: AttendanceRecordCommandService,
    private readonly makeups: AttendanceMakeupService,
  ) {}

  transitionWindow(
    access: AccessContext,
    sessionId: string,
    command: 'open' | 'close' | 'lock',
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.windows.transition(access, sessionId, command, expectedVersion, correlationId);
  }

  openQrChallenge(access: AccessContext, sessionId: string) {
    return this.windows.openChallenge(access, sessionId);
  }

  checkIn(access: AccessContext, token: string, idempotencyKey: string, correlationId: string) {
    return this.checkIns.checkIn(access, token, idempotencyKey, correlationId);
  }

  recordManual(
    access: AccessContext,
    sessionId: string,
    enrollmentId: string,
    status: AttendanceStatus,
    reason: string,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.records.recordManual(
      access,
      sessionId,
      enrollmentId,
      status,
      reason,
      idempotencyKey,
      correlationId,
    );
  }

  correct(
    access: AccessContext,
    recordId: string,
    status: AttendanceStatus,
    reason: string,
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.records.correct(
      access,
      recordId,
      status,
      reason,
      expectedVersion,
      idempotencyKey,
      correlationId,
    );
  }

  createMakeup(
    access: AccessContext,
    missedRecordId: string,
    makeupRecordId: string,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.makeups.create(
      access,
      missedRecordId,
      makeupRecordId,
      idempotencyKey,
      correlationId,
    );
  }
}
