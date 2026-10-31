import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import type { AccessContext, AttendanceStatus } from '@academyops/contracts';
import { AuditService } from '../platform/audit/audit.service';
import { PrismaService } from '../platform/database/prisma.service';
import { IdempotencyService } from '../platform/idempotency/idempotency.service';
import { AttendanceAccessService } from './attendance-access.service';
import { attendanceNotFound, versionConflict } from './attendance.errors';
import { AttendanceRecordMutationService } from './attendance-record-mutation.service';
import type { AttendanceMutationResult } from './attendance.types';
import { AttendanceWindowPolicyService } from './attendance-window-policy.service';

@Injectable()
export class AttendanceRecordCommandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly idempotency: IdempotencyService,
    private readonly accessService: AttendanceAccessService,
    private readonly mutations: AttendanceRecordMutationService,
    private readonly windowPolicy: AttendanceWindowPolicyService,
  ) {}

  async recordManual(
    access: AccessContext,
    sessionId: string,
    enrollmentId: string,
    status: AttendanceStatus,
    reason: string,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<AttendanceMutationResult> {
    return this.prisma.serializable(async (transaction) => {
      const attempt = await this.idempotency.begin<AttendanceMutationResult>(
        transaction,
        access.organizationId,
        'attendance.record_manual',
        idempotencyKey,
        { actorUserId: access.actorUserId, sessionId, enrollmentId, status, reason },
      );
      if (attempt.replayed) return attempt.response;
      const session = await this.accessService.assertSession(
        transaction,
        access,
        'attendance.record_manual',
        sessionId,
      );
      if (!['OPEN', 'CLOSED'].includes(session.attendanceWindowState)) {
        throw new ConflictException({
          code: 'MANUAL_ATTENDANCE_WINDOW_INVALID',
          messageKey: 'attendance.manualWindowInvalid',
        });
      }
      await this.windowPolicy.assertNotEffectivelyLocked(transaction, session, access);
      await this.accessService.assertEnrollmentInSession(
        transaction,
        access.organizationId,
        session,
        enrollmentId,
      );
      const existing = await transaction.attendanceRecord.findFirst({
        where: { organizationId: access.organizationId, sessionId, enrollmentId },
      });
      if (existing) {
        if (existing.currentStatus === status) {
          const result = {
            id: existing.id,
            status: existing.currentStatus,
            version: existing.version,
          };
          await this.idempotency.complete(transaction, attempt.recordId, 200, result);
          return result;
        }
        throw new ConflictException({
          code: 'ATTENDANCE_ALREADY_RECORDED',
          messageKey: 'attendance.alreadyRecordedUseCorrection',
        });
      }
      const record = await transaction.attendanceRecord.create({
        data: {
          organizationId: access.organizationId,
          sessionId,
          enrollmentId,
          currentStatus: status,
          source: 'MANUAL',
          recordedAt: new Date(),
          recordedBy: access.actorUserId,
        },
      });
      await this.mutations.addEvent(transaction, access, record.id, 1, 'UNMARKED', status, reason);
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'attendance.record_manual',
        entityType: 'AttendanceRecord',
        entityId: record.id,
        correlationId,
        after: { status, reason },
      });
      const result = { id: record.id, status: record.currentStatus, version: record.version };
      await this.idempotency.complete(transaction, attempt.recordId, 201, result);
      return result;
    });
  }

  async correct(
    access: AccessContext,
    recordId: string,
    status: AttendanceStatus,
    reason: string,
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<AttendanceMutationResult> {
    return this.prisma.serializable(async (transaction) => {
      const attempt = await this.idempotency.begin<AttendanceMutationResult>(
        transaction,
        access.organizationId,
        'attendance.correct',
        idempotencyKey,
        { actorUserId: access.actorUserId, recordId, status, reason, expectedVersion },
      );
      if (attempt.replayed) return attempt.response;
      const initial = await transaction.attendanceRecord.findFirst({
        where: { id: recordId, organizationId: access.organizationId },
      });
      if (!initial) throw attendanceNotFound();
      const session = await transaction.session.findFirstOrThrow({
        where: { id: initial.sessionId, organizationId: access.organizationId },
      });
      const afterLock = await this.windowPolicy.isEffectivelyLocked(transaction, session);
      const permission = afterLock ? 'attendance.correct_after_lock' : 'attendance.correct';
      await this.accessService.assertSession(transaction, access, permission, session.id);
      if (!access.grants.has(permission)) {
        throw new ForbiddenException({
          code: 'ATTENDANCE_CORRECTION_DENIED',
          messageKey: 'attendance.correctionDenied',
        });
      }
      await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id::text
        FROM attendance_records
        WHERE organization_id = ${access.organizationId}::uuid
          AND id = ${recordId}::uuid
        FOR UPDATE
      `;
      const record = await transaction.attendanceRecord.findFirstOrThrow({
        where: { id: recordId, organizationId: access.organizationId },
      });
      if (record.version !== expectedVersion) throw versionConflict();
      const result = await this.mutations.correct(transaction, access, record, status, reason);
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'attendance.correct',
        entityType: 'AttendanceRecord',
        entityId: record.id,
        correlationId,
        before: { status: record.currentStatus, version: record.version },
        after: { status: result.status, version: result.version, reason },
      });
      await this.idempotency.complete(transaction, attempt.recordId, 200, result);
      return result;
    });
  }
}
