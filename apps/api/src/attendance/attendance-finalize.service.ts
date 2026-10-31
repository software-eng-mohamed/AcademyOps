import { Injectable, ConflictException } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { AuditService } from '../platform/audit/audit.service';
import { PrismaService } from '../platform/database/prisma.service';
import { OutboxService } from '../platform/outbox/outbox.service';
import { AttendanceAccessService } from './attendance-access.service';
import { IdempotencyService } from '../platform/idempotency/idempotency.service';

@Injectable()
export class AttendanceFinalizeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly accessService: AttendanceAccessService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async finalize(
    access: AccessContext,
    sessionId: string,
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.prisma.serializable(async (transaction) => {
      // 1. Begin idempotency before checking mutable state
      const attempt = await this.idempotency.begin<{
        id: string;
        state: string;
        version: number;
        rosterCount: number;
        absentCount: number;
      }>(transaction, access.organizationId, 'attendance.finalize', idempotencyKey, {
        actorUserId: access.actorUserId,
        sessionId,
        expectedVersion,
      });

      if (attempt.replayed) return attempt.response;

      const session = await this.accessService.assertSession(
        transaction,
        access,
        'attendance.qr.open',
        sessionId,
      );

      if (session.attendanceWindowState !== 'OPEN') {
        throw new ConflictException({
          code: 'ATTENDANCE_WINDOW_TRANSITION_INVALID',
          messageKey: 'attendance.windowTransitionInvalid',
        });
      }

      // 2. Atomically update session state to LOCKED and increment version
      const updated = await transaction.session.updateMany({
        where: {
          id: session.id,
          organizationId: access.organizationId,
          version: expectedVersion,
          attendanceWindowState: 'OPEN',
        },
        data: {
          attendanceWindowState: 'LOCKED',
          attendanceLockedAt: new Date(),
          version: { increment: 1 },
        },
      });

      if (updated.count !== 1) {
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          message: 'Version conflict',
        });
      }

      const at = session.startsAt ?? session.endsAt;
      if (!at) {
        throw new ConflictException({
          code: 'NOT_IN_SESSION_ROSTER',
          messageKey: 'attendance.notInRoster',
        });
      }

      // 3. Resolve the roster cohort assignments at the session time
      const assignments = await transaction.enrollmentCohortAssignment.findMany({
        where: {
          organizationId: access.organizationId,
          cohortId: session.cohortId,
          startsAt: { lte: at },
          OR: [{ endsAt: null }, { endsAt: { gt: at } }],
        },
        select: { enrollmentId: true },
        distinct: ['enrollmentId'],
      });

      // 4. Bulk INSERT ... SELECT ... ON CONFLICT for missing ABSENT rows
      const inserted: Array<{ id: string; enrollment_id: string }> = await transaction.$queryRaw`
        INSERT INTO attendance_records (
          id,
          organization_id,
          session_id,
          enrollment_id,
          current_status,
          source,
          recorded_at,
          recorded_by,
          version,
          created_at,
          updated_at
        )
        SELECT
          gen_random_uuid(),
          ${access.organizationId}::uuid,
          ${session.id}::uuid,
          eca.enrollment_id,
          'ABSENT',
          'SYSTEM_CLOSE',
          NOW(),
          ${access.actorUserId}::uuid,
          1,
          NOW(),
          NOW()
        FROM enrollment_cohort_assignments eca
        WHERE eca.organization_id = ${access.organizationId}::uuid
          AND eca.cohort_id = ${session.cohortId}::uuid
          AND eca.starts_at <= ${at}::timestamptz
          AND (eca.ends_at IS NULL OR eca.ends_at > ${at}::timestamptz)
          AND NOT EXISTS (
            SELECT 1
            FROM attendance_records ar
            WHERE ar.organization_id = ${access.organizationId}::uuid
              AND ar.session_id = ${session.id}::uuid
              AND ar.enrollment_id = eca.enrollment_id
          )
        ON CONFLICT (organization_id, session_id, enrollment_id) DO NOTHING
        RETURNING id::text, enrollment_id::text;
      `;

      // 5. Bulk createEvents and Outbox entries for all inserted records
      if (inserted.length > 0) {
        await transaction.attendanceEvent.createMany({
          data: inserted.map((row) => ({
            organizationId: access.organizationId,
            attendanceRecordId: row.id,
            version: 1,
            fromStatus: 'UNMARKED',
            toStatus: 'ABSENT',
            reason: 'SYSTEM_CLOSE',
            actorUserId: access.actorUserId,
          })),
        });

        await this.outbox.addMany(
          transaction,
          inserted.map((row) => ({
            organizationId: access.organizationId,
            aggregateType: 'AttendanceRecord',
            aggregateId: row.id,
            type: 'attendance.recorded',
            payload: { recordId: row.id, version: 1, toStatus: 'ABSENT' },
          })),
        );
      }

      // 6. Deactivate active QR challenges
      await transaction.qrChallenge.updateMany({
        where: {
          organizationId: access.organizationId,
          sessionId: session.id,
          isActive: true,
        },
        data: { isActive: false },
      });

      const nextVersion = expectedVersion + 1;

      // 7. Audit & Outbox log for the session lock
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'attendance.window.lock',
        entityType: 'Session',
        entityId: session.id,
        correlationId,
        before: { state: session.attendanceWindowState },
        after: {
          state: 'LOCKED',
          rosterCount: assignments.length,
          absentCount: inserted.length,
        },
      });

      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'Session',
        aggregateId: session.id,
        type: 'attendance.window.locked',
        payload: { sessionId: session.id, state: 'LOCKED' },
      });

      const result = {
        id: session.id,
        state: 'LOCKED',
        version: nextVersion,
        rosterCount: assignments.length,
        absentCount: inserted.length,
      };

      await this.idempotency.complete(transaction, attempt.recordId, 200, result);
      return result;
    });
  }
}
