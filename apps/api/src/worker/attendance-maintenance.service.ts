import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AttendancePolicyService } from '../attendance/attendance-policy.service';
import { AuditService } from '../platform/audit/audit.service';
import { PrismaService } from '../platform/database/prisma.service';
import { developmentErrorStack } from '../platform/logging/safe-error';

@Injectable()
export class AttendanceMaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AttendanceMaintenanceService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: AttendancePolicyService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.run(), 60_000);
    this.timer.unref();
    void this.run();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const candidates = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT session.id::text
        FROM sessions session
        JOIN cohorts cohort
          ON cohort.organization_id = session.organization_id
         AND cohort.id = session.cohort_id
        LEFT JOIN LATERAL (
          SELECT policy.lock_after_minutes
          FROM attendance_policy_versions policy
          WHERE policy.organization_id = session.organization_id
            AND policy.program_version_id = cohort.program_version_id
            AND (policy.cohort_id = session.cohort_id OR policy.cohort_id IS NULL)
            AND policy.effective_from <= COALESCE(session.starts_at, session.ends_at)
            AND (
              policy.effective_to IS NULL
              OR policy.effective_to > COALESCE(session.starts_at, session.ends_at)
            )
          ORDER BY (policy.cohort_id = session.cohort_id) DESC, policy.effective_from DESC
          LIMIT 1
        ) resolved_policy ON true
        WHERE session.attendance_window_state = 'CLOSED'
          AND session.status IN ('SCHEDULED', 'COMPLETED')
          AND session.ends_at IS NOT NULL
          AND session.ends_at
            + COALESCE(resolved_policy.lock_after_minutes, 1440) * INTERVAL '1 minute'
            <= clock_timestamp()
        ORDER BY session.ends_at, session.id
        LIMIT 25
      `;
      for (const { id } of candidates) await this.lockSession(id);
    } catch (error) {
      this.logger.error('Attendance maintenance failed', developmentErrorStack(error));
    } finally {
      this.running = false;
    }
  }

  private async lockSession(sessionId: string): Promise<void> {
    await this.prisma.serializable(async (transaction) => {
      await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id::text
        FROM sessions
        WHERE id = ${sessionId}::uuid
        FOR UPDATE
      `;
      const current = await transaction.session.findUnique({ where: { id: sessionId } });
      if (
        !current ||
        current.attendanceWindowState !== 'CLOSED' ||
        !['SCHEDULED', 'COMPLETED'].includes(current.status) ||
        !current.startsAt ||
        !current.endsAt
      ) {
        return;
      }
      const cohort = await transaction.cohort.findFirstOrThrow({
        where: { organizationId: current.organizationId, id: current.cohortId },
        select: { programVersionId: true },
      });
      const policy = await this.policies.resolve(
        transaction,
        current.organizationId,
        cohort.programVersionId,
        current.cohortId,
        current.startsAt,
      );
      if (Date.now() < current.endsAt.getTime() + policy.lockAfterMinutes * 60_000) return;

      const inserted = await transaction.$queryRaw<Array<{ id: string; enrollmentId: string }>>`
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
          ${current.organizationId}::uuid,
          ${current.id}::uuid,
          roster.enrollment_id,
          'ABSENT',
          'SYSTEM_CLOSE',
          clock_timestamp(),
          NULL,
          1,
          clock_timestamp(),
          clock_timestamp()
        FROM (
          SELECT DISTINCT assignment.enrollment_id
          FROM enrollment_cohort_assignments assignment
          WHERE assignment.organization_id = ${current.organizationId}::uuid
            AND assignment.cohort_id = ${current.cohortId}::uuid
            AND assignment.starts_at <= ${current.startsAt}
            AND (assignment.ends_at IS NULL OR assignment.ends_at > ${current.startsAt})
        ) roster
        ON CONFLICT (organization_id, session_id, enrollment_id) DO NOTHING
        RETURNING id::text, enrollment_id::text AS "enrollmentId"
      `;

      if (inserted.length) {
        await transaction.attendanceEvent.createMany({
          data: inserted.map((record) => ({
            organizationId: current.organizationId,
            attendanceRecordId: record.id,
            version: 1,
            fromStatus: 'UNMARKED',
            toStatus: 'ABSENT',
            reason: 'SESSION_ENDED_ROSTER_ABSENCE',
            actorUserId: null,
          })),
        });
        await transaction.outboxEvent.createMany({
          data: inserted.map((record) => ({
            organizationId: current.organizationId,
            aggregateType: 'AttendanceRecord',
            aggregateId: record.id,
            type: 'attendance.recorded',
            payload: {
              recordId: record.id,
              enrollmentId: record.enrollmentId,
              version: 1,
              toStatus: 'ABSENT',
              source: 'SYSTEM_CLOSE',
            },
          })),
        });
      }

      await transaction.qrChallenge.updateMany({
        where: { organizationId: current.organizationId, sessionId: current.id, isActive: true },
        data: { isActive: false },
      });
      await transaction.session.update({
        where: { id: current.id },
        data: {
          attendanceWindowState: 'LOCKED',
          attendanceLockedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await this.audit.write(transaction, {
        organizationId: current.organizationId,
        action: 'attendance.window.system_lock',
        entityType: 'Session',
        entityId: current.id,
        correlationId: `worker:attendance-lock:${current.id}:${current.version}`,
        before: { state: current.attendanceWindowState },
        after: { state: 'LOCKED', absentRecordsCreated: inserted.length, policyId: policy.id },
      });
    });
  }
}
