import { createHmac, randomBytes } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AccessContext, AttendanceWindowState } from '@academyops/contracts';
import { DomainTransitionError, transitionAttendanceWindow } from '@academyops/contracts';
import { AuditService } from '../platform/audit/audit.service';
import { PrismaService } from '../platform/database/prisma.service';
import { OutboxService } from '../platform/outbox/outbox.service';
import { AttendanceAccessService } from './attendance-access.service';
import { versionConflict, windowNotOpen } from './attendance.errors';
import { AttendanceWindowPolicyService } from './attendance-window-policy.service';

@Injectable()
export class AttendanceWindowCommandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly accessService: AttendanceAccessService,
    private readonly windowPolicy: AttendanceWindowPolicyService,
  ) {}

  async transition(
    access: AccessContext,
    sessionId: string,
    command: 'open' | 'close' | 'lock',
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.prisma.serializable(async (transaction) => {
      const session = await this.accessService.assertSession(
        transaction,
        access,
        'attendance.qr.open',
        sessionId,
      );
      if (command === 'open') await this.windowPolicy.assertCanOpen(transaction, session, access);

      let next: AttendanceWindowState;
      try {
        next = transitionAttendanceWindow(
          session.attendanceWindowState as AttendanceWindowState,
          command,
        );
      } catch (error) {
        if (error instanceof DomainTransitionError) {
          throw new ConflictException({
            code: 'ATTENDANCE_WINDOW_TRANSITION_INVALID',
            messageKey: 'attendance.windowTransitionInvalid',
          });
        }
        throw error;
      }
      const updated = await transaction.session.updateMany({
        where: { id: session.id, organizationId: access.organizationId, version: expectedVersion },
        data: {
          attendanceWindowState: next,
          attendanceLockedAt: next === 'LOCKED' ? new Date() : null,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw versionConflict();
      if (next !== 'OPEN') {
        await transaction.qrChallenge.updateMany({
          where: { organizationId: access.organizationId, sessionId: session.id, isActive: true },
          data: { isActive: false },
        });
      }
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: `attendance.window.${command}`,
        entityType: 'Session',
        entityId: session.id,
        correlationId,
        before: { state: session.attendanceWindowState },
        after: { state: next },
      });
      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'Session',
        aggregateId: session.id,
        type: `attendance.window.${command}`,
        payload: { sessionId: session.id, state: next },
      });
      return { id: session.id, state: next, version: session.version + 1 };
    });
  }

  async openChallenge(
    access: AccessContext,
    sessionId: string,
  ): Promise<{ token: string; expiresAt: string }> {
    const nonce = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + 45_000);
    return this.prisma.serializable(async (transaction) => {
      await transaction.$queryRaw<Array<{ locked: string }>>`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`${access.organizationId}:${sessionId}:qr`}, 0)
        )::text AS locked
      `;
      const session = await this.accessService.assertSession(
        transaction,
        access,
        'attendance.qr.open',
        sessionId,
      );
      if (session.attendanceWindowState !== 'OPEN') throw windowNotOpen();
      await this.windowPolicy.assertCanOpen(transaction, session, access);
      await transaction.qrChallenge.updateMany({
        where: { organizationId: access.organizationId, sessionId, isActive: true },
        data: { isActive: false },
      });
      const challenge = await transaction.qrChallenge.create({
        data: {
          organizationId: access.organizationId,
          sessionId,
          nonceDigest: this.digest(nonce),
          expiresAt,
          createdBy: access.actorUserId,
        },
      });
      return { token: `${challenge.id}.${nonce}`, expiresAt: expiresAt.toISOString() };
    });
  }

  private digest(nonce: string): string {
    return createHmac('sha256', this.config.getOrThrow<string>('QR_HMAC_SECRET'))
      .update(nonce)
      .digest('hex');
  }
}
