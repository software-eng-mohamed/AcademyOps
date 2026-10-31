import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { afterAll, expect, it } from 'vitest';
import { createTestHarness } from './harness';
import { AttendanceFinalizeService } from '../../src/attendance/attendance-finalize.service';
import { AttendanceService } from '../../src/attendance/attendance.service';
import { AuditService } from '../../src/platform/audit/audit.service';
import { OutboxService } from '../../src/platform/outbox/outbox.service';
import { IdempotencyService } from '../../src/platform/idempotency/idempotency.service';
import { AttendanceAccessService } from '../../src/attendance/attendance-access.service';
import { AttendancePolicyService } from '../../src/attendance/attendance-policy.service';
import { AttendanceMakeupService } from '../../src/attendance/attendance-makeup.service';
import { AttendanceQrCheckInService } from '../../src/attendance/attendance-qr-check-in.service';
import { AttendanceRecordCommandService } from '../../src/attendance/attendance-record-command.service';
import { AttendanceRecordMutationService } from '../../src/attendance/attendance-record-mutation.service';
import { AttendanceWindowCommandService } from '../../src/attendance/attendance-window-command.service';
import { AttendanceWindowPolicyService } from '../../src/attendance/attendance-window-policy.service';
import { setupTestContext } from './attendance-test.helper';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../src/platform/database/prisma.service';

const harness = createTestHarness();

harness.databaseDescribe('Attendance Finalize & Correction Integration Flow', () => {
  afterAll(async () => {
    await harness.prisma.$disconnect();
  });

  it('verifies idempotent finalization, bulk inserts, LATE/ABSENT state, events, and genuine correction replays', () =>
    harness.inRollbackTransaction(async (transaction) => {
      const adapter = {
        organization: transaction.organization,
        person: transaction.person,
        user: transaction.user,
        session: transaction.session,
        cohort: transaction.cohort,
        enrollment: transaction.enrollment,
        enrollmentCohortAssignment: transaction.enrollmentCohortAssignment,
        attendanceRecord: transaction.attendanceRecord,
        attendanceEvent: transaction.attendanceEvent,
        qrChallenge: transaction.qrChallenge,
        attendancePolicyVersion: transaction.attendancePolicyVersion,
        auditEvent: transaction.auditEvent,
        outboxEvent: transaction.outboxEvent,
        $queryRaw: transaction.$queryRaw.bind(transaction),
        $executeRaw: transaction.$executeRaw.bind(transaction),
        $executeRawUnsafe: transaction.$executeRawUnsafe.bind(transaction),
        serializable: async <T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> =>
          work(transaction),
      } as unknown as PrismaService;

      const audit = new AuditService();
      const outbox = new OutboxService();
      const config = new ConfigService({ QR_HMAC_SECRET: 'q'.repeat(40) });
      const accessService = new AttendanceAccessService();
      const policies = new AttendancePolicyService(adapter);
      const idempotency = new IdempotencyService(adapter);

      const finalizeService = new AttendanceFinalizeService(
        adapter,
        audit,
        outbox,
        accessService,
        idempotency,
      );

      const windowPolicy = new AttendanceWindowPolicyService(policies);
      const mutations = new AttendanceRecordMutationService(outbox);
      const windowCommands = new AttendanceWindowCommandService(
        adapter,
        config,
        audit,
        outbox,
        accessService,
        windowPolicy,
      );
      const checkIns = new AttendanceQrCheckInService(
        adapter,
        config,
        audit,
        idempotency,
        mutations,
        windowPolicy,
      );
      const recordCommands = new AttendanceRecordCommandService(
        adapter,
        audit,
        idempotency,
        accessService,
        mutations,
        windowPolicy,
      );
      const makeups = new AttendanceMakeupService(
        adapter,
        audit,
        outbox,
        idempotency,
        accessService,
      );
      const attendanceService = new AttendanceService(
        windowCommands,
        checkIns,
        recordCommands,
        makeups,
      );

      const ctx = await setupTestContext(transaction);

      await transaction.qrChallenge.create({
        data: {
          organizationId: ctx.org.id,
          sessionId: ctx.session.id,
          nonceDigest: randomUUID(),
          isActive: true,
          expiresAt: new Date(Date.now() + 600_000),
          createdBy: ctx.uStaff.id,
        },
      });

      const manualKey = `key-manual-${randomUUID()}`;
      const manualRes = await attendanceService.recordManual(
        ctx.staffAccess,
        ctx.session.id,
        ctx.e1.id,
        'LATE',
        'Late arrival',
        manualKey,
        'corr-manual',
      );
      expect(manualRes.status).toBe('LATE');

      const finalizeKey = `fin-${randomUUID()}`;
      await harness.expectDatabaseRejection(transaction, async () => {
        try {
          await finalizeService.finalize(
            ctx.staffAccess,
            ctx.session.id,
            99,
            finalizeKey,
            'corr-fin',
          );
        } catch (error) {
          expect(error).toBeInstanceOf(ConflictException);
          throw error;
        }
      });

      const finRes = await finalizeService.finalize(
        ctx.staffAccess,
        ctx.session.id,
        ctx.session.version,
        finalizeKey,
        'corr-fin',
      );

      expect(finRes.state).toBe('LOCKED');
      expect(finRes.rosterCount).toBe(2);
      expect(finRes.absentCount).toBe(1);

      // Assert Student 1 remains LATE after finalization
      const r1 = await transaction.attendanceRecord.findFirstOrThrow({
        where: { organizationId: ctx.org.id, sessionId: ctx.session.id, enrollmentId: ctx.e1.id },
      });
      expect(r1.currentStatus).toBe('LATE');

      // Assert Student 2 created ABSENT with SYSTEM_CLOSE and matching event
      const r2 = await transaction.attendanceRecord.findFirstOrThrow({
        where: { organizationId: ctx.org.id, sessionId: ctx.session.id, enrollmentId: ctx.e2.id },
      });
      expect(r2.currentStatus).toBe('ABSENT');
      expect(r2.source).toBe('SYSTEM_CLOSE');

      const evt2 = await transaction.attendanceEvent.findFirstOrThrow({
        where: { organizationId: ctx.org.id, attendanceRecordId: r2.id, version: 1 },
      });
      expect(evt2.fromStatus).toBe('UNMARKED');
      expect(evt2.toStatus).toBe('ABSENT');

      // Assert Session is LOCKED at next version and QR challenge is inactive
      const sessionAfter = await transaction.session.findUniqueOrThrow({
        where: { id: ctx.session.id },
      });
      expect(sessionAfter.attendanceWindowState).toBe('LOCKED');
      expect(sessionAfter.version).toBe(ctx.session.version + 1);

      const challengeAfter = await transaction.qrChallenge.findFirstOrThrow({
        where: { organizationId: ctx.org.id, sessionId: ctx.session.id },
      });
      expect(challengeAfter.isActive).toBe(false);

      // Replay finalize with exact same key after lock
      const finReplay = await finalizeService.finalize(
        ctx.staffAccess,
        ctx.session.id,
        ctx.session.version,
        finalizeKey,
        'corr-fin-replay',
      );
      expect(finReplay).toEqual(finRes);

      // Replay manualKey after LOCKED returns replayed response
      const manualReplayAfterLock = await attendanceService.recordManual(
        ctx.staffAccess,
        ctx.session.id,
        ctx.e1.id,
        'LATE',
        'Late arrival',
        manualKey,
        'corr-manual-replay',
      );
      expect(manualReplayAfterLock).toEqual(manualRes);

      const correctKey1 = `c1-${randomUUID()}`;
      await harness.expectDatabaseRejection(transaction, async () => {
        try {
          await attendanceService.correct(
            ctx.staffAccess,
            r2.id,
            'EXCUSED',
            'Lock correction try',
            r2.version,
            correctKey1,
            'corr-cor',
          );
        } catch (error) {
          expect(error).toBeInstanceOf(NotFoundException);
          throw error;
        }
      });

      // Genuine first post-lock correction
      const correctKey2 = `c2-${randomUUID()}`;
      const correctRes1 = await attendanceService.correct(
        ctx.adminAccess,
        r2.id,
        'EXCUSED',
        'Medical excuse validated',
        r2.version,
        correctKey2,
        'corr-cor-1',
      );
      expect(correctRes1.status).toBe('EXCUSED');
      expect(correctRes1.version).toBe(2);

      // Genuine second correction with different idempotency key and current version (2)
      const correctKey3 = `c3-${randomUUID()}`;
      const correctRes2 = await attendanceService.correct(
        ctx.adminAccess,
        r2.id,
        'PRESENT',
        'Student arrived after medical review',
        correctRes1.version,
        correctKey3,
        'corr-cor-2',
      );
      expect(correctRes2.status).toBe('PRESENT');
      expect(correctRes2.version).toBe(3);

      const evt3 = await transaction.attendanceEvent.findFirstOrThrow({
        where: { organizationId: ctx.org.id, attendanceRecordId: r2.id, version: 3 },
      });
      expect(evt3.fromStatus).toBe('EXCUSED');
      expect(evt3.toStatus).toBe('PRESENT');

      // Replay first correction's original key/payload/expectedVersion after second correction
      const correctReplay = await attendanceService.correct(
        ctx.adminAccess,
        r2.id,
        'EXCUSED',
        'Medical excuse validated',
        r2.version,
        correctKey2,
        'corr-cor-replay',
      );
      expect(correctReplay).toEqual(correctRes1);

      // Differing payload with same key throws ConflictException
      await expect(
        attendanceService.correct(
          ctx.adminAccess,
          r2.id,
          'LATE',
          'Medical excuse validated',
          r2.version,
          correctKey2,
          'corr-cor-diff',
        ),
      ).rejects.toThrow(ConflictException);
    }));
});
