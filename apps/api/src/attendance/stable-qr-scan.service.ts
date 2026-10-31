import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AccessContext } from '@academyops/contracts';
import { AuditService } from '../platform/audit/audit.service';
import { PrismaService } from '../platform/database/prisma.service';
import { IdempotencyService } from '../platform/idempotency/idempotency.service';
import { OutboxService } from '../platform/outbox/outbox.service';
import { AttendanceAccessService } from './attendance-access.service';
import { generateStableQrToken, parseAndVerifyStableQrToken } from './stable-qr.helper';

@Injectable()
export class StableQrScanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly idempotency: IdempotencyService,
    private readonly accessService: AttendanceAccessService,
  ) {}

  generateToken(organizationId: string, studentPersonId: string): string {
    const secret = this.config.getOrThrow<string>('QR_HMAC_SECRET');
    return generateStableQrToken(secret, organizationId, studentPersonId);
  }

  async scan(
    access: AccessContext,
    sessionId: string,
    input: { token: string; status: 'PRESENT' | 'LATE' },
    idempotencyKey: string,
    correlationId: string,
  ) {
    if (input.status !== 'PRESENT' && input.status !== 'LATE') {
      throw new BadRequestException({
        code: 'INVALID_ATTENDANCE_STATUS',
        message: 'Scan status must be PRESENT or LATE',
      });
    }

    const secret = this.config.getOrThrow<string>('QR_HMAC_SECRET');
    const { studentPersonId } = parseAndVerifyStableQrToken(
      input.token,
      secret,
      access.organizationId,
    );

    return this.prisma.serializable(async (transaction) => {
      // 1. Idempotency Begin before mutable checks
      const attempt = await this.idempotency.begin<{ id: string; status: string; version: number }>(
        transaction,
        access.organizationId,
        'attendance.scan',
        idempotencyKey,
        { actorUserId: access.actorUserId, sessionId, studentPersonId, status: input.status },
      );

      if (attempt.replayed) return attempt.response;

      // 2. Session checks
      const session = await this.accessService.assertSession(
        transaction,
        access,
        'attendance.record_manual',
        sessionId,
      );

      if (session.attendanceWindowState !== 'OPEN') {
        throw new ConflictException({
          code: 'ATTENDANCE_WINDOW_NOT_OPEN',
          messageKey: 'attendance.windowNotOpen',
        });
      }

      const at = session.startsAt ?? session.endsAt;
      if (!at) {
        throw new ConflictException({
          code: 'NOT_IN_SESSION_ROSTER',
          messageKey: 'attendance.notInRoster',
        });
      }

      // 3. Roster student checks
      const studentPerson = await transaction.person.findFirst({
        where: { organizationId: access.organizationId, id: studentPersonId },
      });
      if (!studentPerson) {
        throw new ConflictException({
          code: 'STUDENT_NOT_FOUND',
          message: 'Student not found',
        });
      }

      const assignments = await transaction.enrollmentCohortAssignment.findMany({
        where: {
          organizationId: access.organizationId,
          cohortId: session.cohortId,
          startsAt: { lte: at },
          OR: [{ endsAt: null }, { endsAt: { gt: at } }],
        },
        select: { enrollmentId: true },
      });

      const enrollment = await transaction.enrollment.findFirst({
        where: {
          id: { in: assignments.map((assignment) => assignment.enrollmentId) },
          organizationId: access.organizationId,
          studentPersonId: studentPersonId,
        },
      });

      if (!enrollment) {
        throw new ConflictException({
          code: 'NOT_IN_SESSION_ROSTER',
          messageKey: 'attendance.notInRoster',
        });
      }

      // 4. Duplicate checks
      const existing = await transaction.attendanceRecord.findFirst({
        where: {
          organizationId: access.organizationId,
          sessionId,
          enrollmentId: enrollment.id,
        },
      });

      if (existing) {
        if (existing.currentStatus === 'PRESENT' || existing.currentStatus === 'LATE') {
          const result = {
            id: existing.id,
            status: existing.currentStatus,
            version: existing.version,
          };
          await this.idempotency.complete(transaction, attempt.recordId, 200, result);
          return result;
        }

        if (existing.currentStatus === 'ABSENT' || existing.currentStatus === 'EXCUSED') {
          throw new ConflictException({
            code: 'ATTENDANCE_RECORDED',
            message: 'Attendance already recorded. Use correction endpoint.',
          });
        }
      }

      // 5. Create new present/late record
      const record = await transaction.attendanceRecord.create({
        data: {
          organizationId: access.organizationId,
          sessionId,
          enrollmentId: enrollment.id,
          currentStatus: input.status,
          source: 'QR',
          recordedAt: new Date(),
          recordedBy: access.actorUserId,
        },
      });

      await transaction.attendanceEvent.create({
        data: {
          organizationId: access.organizationId,
          attendanceRecordId: record.id,
          version: 1,
          fromStatus: 'UNMARKED',
          toStatus: input.status,
          reason: 'QR_SCAN',
          actorUserId: access.actorUserId,
        },
      });

      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'AttendanceRecord',
        aggregateId: record.id,
        type: 'attendance.recorded',
        payload: { recordId: record.id, version: 1, toStatus: input.status },
      });

      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'attendance.record_scan',
        entityType: 'AttendanceRecord',
        entityId: record.id,
        correlationId,
        after: { status: input.status, reason: 'QR_SCAN' },
      });

      const result = { id: record.id, status: record.currentStatus, version: record.version };
      await this.idempotency.complete(transaction, attempt.recordId, 201, result);
      return result;
    });
  }
}
