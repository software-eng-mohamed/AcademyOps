import { createHmac, timingSafeEqual } from 'node:crypto';
import { ForbiddenException, HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AccessContext } from '@academyops/contracts';
import { AuditService } from '../platform/audit/audit.service';
import { PrismaService } from '../platform/database/prisma.service';
import { IdempotencyService } from '../platform/idempotency/idempotency.service';
import { invalidQr, notInRoster, windowNotOpen } from './attendance.errors';
import { AttendanceRecordMutationService } from './attendance-record-mutation.service';
import {
  AttendanceAnomalyError,
  type AnomalyReason,
  type AttendanceMutationResult,
} from './attendance.types';
import { AttendanceWindowPolicyService } from './attendance-window-policy.service';

@Injectable()
export class AttendanceQrCheckInService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly idempotency: IdempotencyService,
    private readonly mutations: AttendanceRecordMutationService,
    private readonly windowPolicy: AttendanceWindowPolicyService,
  ) {}

  async checkIn(
    access: AccessContext,
    token: string,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<AttendanceMutationResult> {
    const [challengeId, nonce, extra] = token.split('.');
    if (!challengeId || !nonce || extra || !this.isUuid(challengeId)) {
      await this.recordAnomaly(access, 'MALFORMED_TOKEN');
      throw invalidQr();
    }

    try {
      return await this.prisma.serializable(async (transaction) => {
        const attempt = await this.idempotency.begin<AttendanceMutationResult>(
          transaction,
          access.organizationId,
          'attendance.check_in',
          idempotencyKey,
          { challengeId, actorUserId: access.actorUserId },
        );
        if (attempt.replayed) return attempt.response;
        const challenge = await transaction.qrChallenge.findFirst({
          where: { id: challengeId, organizationId: access.organizationId },
        });
        if (
          !challenge ||
          !challenge.isActive ||
          challenge.expiresAt <= new Date() ||
          !this.safeDigestMatch(nonce, challenge.nonceDigest)
        ) {
          throw new AttendanceAnomalyError(
            'CHALLENGE_INVALID_OR_EXPIRED',
            invalidQr(),
            challenge?.id,
            challenge?.sessionId,
          );
        }
        const session = await transaction.session.findFirst({
          where: { id: challenge.sessionId, organizationId: access.organizationId },
        });
        if (!session || session.attendanceWindowState !== 'OPEN') {
          throw new AttendanceAnomalyError(
            'WINDOW_NOT_OPEN',
            windowNotOpen(),
            challenge.id,
            challenge.sessionId,
          );
        }
        try {
          await this.windowPolicy.assertCanOpen(transaction, session);
        } catch (error) {
          if (error instanceof HttpException) {
            throw new AttendanceAnomalyError('WINDOW_NOT_OPEN', error, challenge.id, session.id);
          }
          throw error;
        }
        if (!access.studentPersonId) {
          throw new AttendanceAnomalyError(
            'STUDENT_CONTEXT_REQUIRED',
            new ForbiddenException({
              code: 'STUDENT_CONTEXT_REQUIRED',
              messageKey: 'attendance.studentContextRequired',
            }),
            challenge.id,
            session.id,
          );
        }
        const at = session.startsAt ?? session.endsAt;
        if (!at) {
          throw new AttendanceAnomalyError(
            'NOT_IN_ROSTER',
            notInRoster(),
            challenge.id,
            session.id,
          );
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
            studentPersonId: access.studentPersonId,
          },
        });
        if (!enrollment) {
          throw new AttendanceAnomalyError(
            'NOT_IN_ROSTER',
            notInRoster(),
            challenge.id,
            session.id,
          );
        }
        const existing = await transaction.attendanceRecord.findFirst({
          where: {
            organizationId: access.organizationId,
            sessionId: session.id,
            enrollmentId: enrollment.id,
          },
        });
        if (existing?.currentStatus === 'PRESENT' || existing?.currentStatus === 'LATE') {
          const result = {
            id: existing.id,
            status: existing.currentStatus,
            version: existing.version,
          };
          await this.idempotency.complete(transaction, attempt.recordId, 200, result);
          return result;
        }
        if (existing) {
          const result = await this.mutations.correct(
            transaction,
            access,
            existing,
            'PRESENT',
            'QR_CHECK_IN',
          );
          await this.idempotency.complete(transaction, attempt.recordId, 200, result);
          return result;
        }
        const record = await transaction.attendanceRecord.create({
          data: {
            organizationId: access.organizationId,
            sessionId: session.id,
            enrollmentId: enrollment.id,
            currentStatus: 'PRESENT',
            source: 'QR',
            recordedAt: new Date(),
            recordedBy: access.actorUserId,
          },
        });
        await this.mutations.addEvent(
          transaction,
          access,
          record.id,
          1,
          'UNMARKED',
          'PRESENT',
          'QR_CHECK_IN',
        );
        await this.audit.write(transaction, {
          organizationId: access.organizationId,
          actorUserId: access.actorUserId,
          action: 'attendance.check_in',
          entityType: 'AttendanceRecord',
          entityId: record.id,
          correlationId,
        });
        const result = { id: record.id, status: record.currentStatus, version: record.version };
        await this.idempotency.complete(transaction, attempt.recordId, 200, result);
        return result;
      });
    } catch (error) {
      if (error instanceof AttendanceAnomalyError) {
        await this.recordAnomaly(access, error.reasonCode, error.challengeId, error.sessionId);
        throw error.response;
      }
      throw error;
    }
  }

  private async recordAnomaly(
    access: AccessContext,
    reasonCode: AnomalyReason,
    challengeId?: string,
    sessionId?: string,
  ): Promise<void> {
    try {
      await this.prisma.attendanceAnomaly.create({
        data: {
          organizationId: access.organizationId,
          sessionId: sessionId ?? null,
          challengeId: challengeId ?? null,
          actorUserId: access.actorUserId,
          studentPersonId: access.studentPersonId ?? null,
          reasonCode,
        },
      });
    } catch {
      // Anomaly persistence must never mask the original authorization or QR error.
    }
  }

  private digest(nonce: string): string {
    return createHmac('sha256', this.config.getOrThrow<string>('QR_HMAC_SECRET'))
      .update(nonce)
      .digest('hex');
  }

  private safeDigestMatch(nonce: string, expected: string): boolean {
    const actual = Buffer.from(this.digest(nonce));
    const target = Buffer.from(expected);
    return actual.length === target.length && timingSafeEqual(actual, target);
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }
}
