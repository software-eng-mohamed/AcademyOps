import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma, WhatsappOtpChannel } from '@prisma/client';
import { PrismaService } from '../platform/database/prisma.service';
import { OutboxService } from '../platform/outbox/outbox.service';
import type { OtpConnectorStatusDto } from './otp-connector.dto';
import type { OtpConnectorChannelDto } from './otp-connector.dto';
import { otpChannelStates, type OtpChannelState } from './otp-channel.types';
import { OtpChannelQrService } from './otp-channel-qr.service';

@Injectable()
export class OtpConnectorStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly qr: OtpChannelQrService,
  ) {}

  async channels(): Promise<OtpConnectorChannelDto[]> {
    const channels = await this.prisma.whatsappOtpChannel.findMany({
      where: { enabled: true },
      select: {
        organizationId: true,
        enabled: true,
        desiredState: true,
        state: true,
        commandVersion: true,
        handledCommandVersion: true,
      },
      orderBy: { organizationId: 'asc' },
      take: 20,
    });
    return channels.map((channel) => ({
      ...channel,
      state: otpChannelStates.includes(channel.state as OtpChannelState)
        ? (channel.state as OtpChannelState)
        : 'FAULTED',
    }));
  }

  async report(input: OtpConnectorStatusDto): Promise<void> {
    const qrExpiry = this.qrExpiry(input);
    const clearQr = input.state !== 'QR_REQUIRED';
    await this.prisma.serializable(async (transaction) => {
      const existing = await transaction.whatsappOtpChannel.findUnique({
        where: { organizationId: input.organizationId },
      });
      if (!existing || input.commandVersion !== existing.commandVersion) {
        throw new ConflictException({ code: 'OTP_CONNECTOR_COMMAND_STALE' });
      }
      if (qrExpiry && input.qr) await this.qr.write(input.organizationId, input.qr, qrExpiry);
      const meaningful = this.meaningful(existing, input, qrExpiry);
      const channel = await transaction.whatsappOtpChannel.update({
        where: { id: existing.id },
        data: {
          provider: 'BAILEYS',
          state: input.state,
          handledCommandVersion: input.commandVersion,
          ...(existing.desiredState === 'LOGGED_OUT' ? { desiredState: 'CONNECTED' } : {}),
          phoneMasked: input.phoneMasked ?? existing.phoneMasked,
          lastErrorCode: input.errorCode ?? null,
          qrExpiresAt: qrExpiry,
          ...(input.state === 'CONNECTED'
            ? {
                ...(existing.state === 'CONNECTED' ? {} : { lastConnectedAt: new Date() }),
                lastHeartbeatAt: new Date(),
              }
            : {}),
          ...(['DISCONNECTED', 'FAULTED', 'STALE'].includes(input.state)
            ? { lastDisconnectedAt: new Date(), lastHeartbeatAt: null }
            : {}),
          ...(meaningful ? { version: { increment: 1 } } : {}),
        },
      });
      const eventType = transitionEvent(existing.state, input.state);
      if (eventType) await this.addEvent(transaction, channel, eventType);
    });
    if (clearQr) await this.qr.clear(input.organizationId).catch(() => undefined);
  }

  private qrExpiry(input: OtpConnectorStatusDto): Date | null {
    if (input.state !== 'QR_REQUIRED') return null;
    const expiry = input.qrExpiresAt ? new Date(input.qrExpiresAt) : new Date(Number.NaN);
    const lifetime = expiry.getTime() - Date.now();
    if (!input.qr || !Number.isFinite(expiry.getTime()) || lifetime < 5_000 || lifetime > 120_000) {
      throw new ConflictException({ code: 'OTP_CONNECTOR_QR_INVALID' });
    }
    return expiry;
  }

  private meaningful(
    current: WhatsappOtpChannel,
    input: OtpConnectorStatusDto,
    qrExpiry: Date | null,
  ): boolean {
    return (
      current.state !== input.state ||
      current.handledCommandVersion !== input.commandVersion ||
      current.phoneMasked !== (input.phoneMasked ?? current.phoneMasked) ||
      current.lastErrorCode !== (input.errorCode ?? null) ||
      current.qrExpiresAt?.getTime() !== qrExpiry?.getTime()
    );
  }

  private async addEvent(
    transaction: Prisma.TransactionClient,
    channel: WhatsappOtpChannel,
    type: string,
  ): Promise<void> {
    await this.outbox.add(transaction, {
      organizationId: channel.organizationId,
      aggregateType: 'WhatsappOtpChannel',
      aggregateId: channel.id,
      type,
      payload: {
        channelId: channel.id,
        state: channel.state,
        errorCode: channel.lastErrorCode,
      },
    });
  }
}

function transitionEvent(previous: string, next: string): string | null {
  if (previous === next) return null;
  if (next === 'QR_REQUIRED') return 'messaging.otp_channel.qr_required';
  if (next === 'CONNECTED') return 'messaging.otp_channel.recovered';
  if (['DISCONNECTED', 'FAULTED', 'STALE'].includes(next)) {
    return 'messaging.otp_channel.unavailable';
  }
  return null;
}
