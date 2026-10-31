import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { AuditService } from '../platform/audit/audit.service';
import { PrismaService } from '../platform/database/prisma.service';
import { IdempotencyService } from '../platform/idempotency/idempotency.service';
import { OutboxService } from '../platform/outbox/outbox.service';
import { OtpChannelAvailabilityService } from './otp-channel-availability.service';
import { OtpChannelQrService } from './otp-channel-qr.service';
import type { OtpChannelCommand, OtpChannelStatus } from './otp-channel.types';

type CommandData = {
  enabled: boolean;
  desiredState: string;
  state: string;
  lastErrorCode: null;
  qrExpiresAt: null;
};

@Injectable()
export class OtpChannelControlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly idempotency: IdempotencyService,
    private readonly availability: OtpChannelAvailabilityService,
    private readonly qr: OtpChannelQrService,
  ) {}

  async command(
    access: AccessContext,
    action: OtpChannelCommand,
    reason: string,
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<OtpChannelStatus> {
    if (!access.grants.get('messaging.otp.manage')?.has('O')) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        messageKey: 'auth.permissionDenied',
      });
    }
    const result = await this.prisma.serializable(async (transaction) => {
      const attempt = await this.idempotency.begin<OtpChannelStatus>(
        transaction,
        access.organizationId,
        `messaging.otp.${action.toLowerCase()}`,
        idempotencyKey,
        { actorUserId: access.actorUserId, action, reason, expectedVersion },
      );
      if (attempt.replayed) return { snapshot: attempt.response, replayed: true };

      const existing = await transaction.whatsappOtpChannel.findUnique({
        where: { organizationId: access.organizationId },
      });
      if ((existing?.version ?? 0) !== expectedVersion) throw this.versionConflict();
      const data = this.commandData(action, existing?.state);
      const channel = existing
        ? await transaction.whatsappOtpChannel.update({
            where: { id: existing.id },
            data: { ...data, commandVersion: { increment: 1 }, version: { increment: 1 } },
          })
        : await transaction.whatsappOtpChannel.create({
            data: {
              organizationId: access.organizationId,
              ...data,
              commandVersion: 1,
            },
          });
      const result = this.availability.snapshot(channel);
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: `messaging.otp.${action.toLowerCase()}`,
        entityType: 'WhatsappOtpChannel',
        entityId: channel.id,
        correlationId,
        ...(existing ? { before: this.safeSnapshot(existing) } : {}),
        after: this.safeSnapshot(channel),
        metadata: { reason },
      });
      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'WhatsappOtpChannel',
        aggregateId: channel.id,
        type: 'messaging.otp_channel.commanded',
        payload: { channelId: channel.id, action, enabled: channel.enabled, state: channel.state },
      });
      await this.idempotency.complete(transaction, attempt.recordId, 200, result);
      return { snapshot: result, replayed: false };
    });
    if (!result.replayed) await this.qr.clear(access.organizationId).catch(() => undefined);
    return result.snapshot;
  }

  private commandData(action: OtpChannelCommand, currentState?: string): CommandData {
    if (action === 'DISABLE') {
      return {
        enabled: false,
        desiredState: 'DISCONNECTED',
        state: 'DISABLED',
        lastErrorCode: null,
        qrExpiresAt: null,
      };
    }
    return {
      enabled: true,
      desiredState: action === 'RESET' ? 'LOGGED_OUT' : 'CONNECTED',
      state: currentState === 'CONNECTED' && action === 'CONNECT' ? 'CONNECTED' : 'STARTING',
      lastErrorCode: null,
      qrExpiresAt: null,
    };
  }

  private safeSnapshot(channel: {
    enabled: boolean;
    desiredState: string;
    state: string;
    commandVersion: number;
    version: number;
  }): Prisma.InputJsonObject {
    return {
      enabled: channel.enabled,
      desiredState: channel.desiredState,
      state: channel.state,
      commandVersion: channel.commandVersion,
      version: channel.version,
    };
  }

  private versionConflict(): ConflictException {
    return new ConflictException({
      code: 'VERSION_CONFLICT',
      messageKey: 'errors.versionConflict',
    });
  }
}
