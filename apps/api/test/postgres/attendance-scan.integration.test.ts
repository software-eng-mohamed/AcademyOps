import { randomUUID } from 'node:crypto';
import { ForbiddenException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { afterAll, expect, it } from 'vitest';
import { createTestHarness } from './harness';
import { StableQrScanService } from '../../src/attendance/stable-qr-scan.service';
import { AuditService } from '../../src/platform/audit/audit.service';
import { OutboxService } from '../../src/platform/outbox/outbox.service';
import { IdempotencyService } from '../../src/platform/idempotency/idempotency.service';
import { AttendanceAccessService } from '../../src/attendance/attendance-access.service';
import { setupTestContext } from './attendance-test.helper';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../src/platform/database/prisma.service';

const harness = createTestHarness();

harness.databaseDescribe('Attendance Scan Integration Flow', () => {
  afterAll(async () => {
    await harness.prisma.$disconnect();
  });

  it('validates stable QR scans, signature tampering, cross-org checks, same-key replays, and replay after lock', () =>
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
      const idempotency = new IdempotencyService(adapter);

      const scanService = new StableQrScanService(
        adapter,
        config,
        audit,
        outbox,
        idempotency,
        accessService,
      );

      const ctx = await setupTestContext(transaction);

      const validToken = scanService.generateToken(ctx.org.id, ctx.p1.id);
      expect(validToken).toContain('STABLE:v1:');

      const key1 = `key-${randomUUID()}`;
      const res1 = await scanService.scan(
        ctx.staffAccess,
        ctx.session.id,
        { token: validToken, status: 'PRESENT' },
        key1,
        'corr1',
      );
      expect(res1.status).toBe('PRESENT');
      expect(res1.version).toBe(1);

      const resReplay = await scanService.scan(
        ctx.staffAccess,
        ctx.session.id,
        { token: validToken, status: 'PRESENT' },
        key1,
        'corr2',
      );
      expect(resReplay).toEqual(res1);

      await expect(
        scanService.scan(
          ctx.staffAccess,
          ctx.session.id,
          { token: validToken, status: 'LATE' },
          key1,
          'corr3',
        ),
      ).rejects.toThrow(ConflictException);

      const key2 = `key-${randomUUID()}`;
      const res2 = await scanService.scan(
        ctx.staffAccess,
        ctx.session.id,
        { token: validToken, status: 'PRESENT' },
        key2,
        'corr4',
      );
      expect(res2.id).toBe(res1.id);

      const tamperedToken = validToken.slice(0, -4) + 'abcd';
      await expect(
        scanService.scan(
          ctx.staffAccess,
          ctx.session.id,
          { token: tamperedToken, status: 'PRESENT' },
          `k-${randomUUID()}`,
          'corr',
        ),
      ).rejects.toThrow(ForbiddenException);

      const otherOrgToken = scanService.generateToken(randomUUID(), ctx.p1.id);
      await expect(
        scanService.scan(
          ctx.staffAccess,
          ctx.session.id,
          { token: otherOrgToken, status: 'PRESENT' },
          `k-${randomUUID()}`,
          'corr',
        ),
      ).rejects.toThrow(ForbiddenException);

      const wrongStudentToken = scanService.generateToken(ctx.org.id, ctx.pNotInRoster.id);
      await expect(
        scanService.scan(
          ctx.staffAccess,
          ctx.session.id,
          { token: wrongStudentToken, status: 'PRESENT' },
          `k-${randomUUID()}`,
          'corr',
        ),
      ).rejects.toThrow(ConflictException);

      // Lock window
      await transaction.session.update({
        where: { id: ctx.session.id },
        data: { attendanceWindowState: 'LOCKED' },
      });

      // New key scan fails after LOCKED
      await expect(
        scanService.scan(
          ctx.staffAccess,
          ctx.session.id,
          { token: validToken, status: 'PRESENT' },
          `k-new-${randomUUID()}`,
          'corr',
        ),
      ).rejects.toThrow(ConflictException);

      // Replay same key key1 after LOCKED succeeds and returns stored response
      const resReplayAfterLock = await scanService.scan(
        ctx.staffAccess,
        ctx.session.id,
        { token: validToken, status: 'PRESENT' },
        key1,
        'corr5',
      );
      expect(resReplayAfterLock).toEqual(res1);
    }));
});
