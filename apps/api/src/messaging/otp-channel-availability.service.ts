import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { WhatsappOtpChannel } from '@prisma/client';
import { PrismaService } from '../platform/database/prisma.service';
import type { OtpChannelState, OtpChannelStatus } from './otp-channel.types';

const HEARTBEAT_STALE_MS = 75_000;

@Injectable()
export class OtpChannelAvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async read(organizationId: string): Promise<OtpChannelStatus> {
    const channel = await this.prisma.whatsappOtpChannel.findUnique({
      where: { organizationId },
    });
    return this.snapshot(channel);
  }

  async assertAvailable(organizationId: string): Promise<void> {
    const status = await this.read(organizationId);
    if (status.otpAvailable) return;
    throw new ServiceUnavailableException({
      code: 'PHONE_OTP_UNAVAILABLE',
      messageKey: 'auth.phoneOtpUnavailable',
    });
  }

  snapshot(channel: WhatsappOtpChannel | null): OtpChannelStatus {
    if (!channel) return this.empty();
    const reportedState = isOtpChannelState(channel.state) ? channel.state : 'FAULTED';
    const heartbeatFresh =
      channel.lastHeartbeatAt !== null &&
      channel.lastHeartbeatAt.getTime() > Date.now() - HEARTBEAT_STALE_MS;
    const state: OtpChannelState = !channel.enabled
      ? 'DISABLED'
      : reportedState === 'CONNECTED' && !heartbeatFresh
        ? 'STALE'
        : reportedState;
    const qrCurrent =
      state === 'QR_REQUIRED' &&
      channel.qrExpiresAt !== null &&
      channel.qrExpiresAt.getTime() > Date.now();
    return {
      id: channel.id,
      provider: 'BAILEYS',
      enabled: channel.enabled,
      state,
      otpAvailable: state === 'CONNECTED' && heartbeatFresh,
      needsQr: qrCurrent,
      phoneMasked: channel.phoneMasked,
      lastErrorCode: channel.lastErrorCode,
      lastConnectedAt: channel.lastConnectedAt?.toISOString() ?? null,
      lastDisconnectedAt: channel.lastDisconnectedAt?.toISOString() ?? null,
      lastHeartbeatAt: channel.lastHeartbeatAt?.toISOString() ?? null,
      qrExpiresAt: qrCurrent ? (channel.qrExpiresAt?.toISOString() ?? null) : null,
      version: channel.version,
    };
  }

  private empty(): OtpChannelStatus {
    return {
      id: null,
      provider: 'BAILEYS',
      enabled: false,
      state: 'DISABLED',
      otpAvailable: false,
      needsQr: false,
      phoneMasked: null,
      lastErrorCode: null,
      lastConnectedAt: null,
      lastDisconnectedAt: null,
      lastHeartbeatAt: null,
      qrExpiresAt: null,
      version: 0,
    };
  }
}

function isOtpChannelState(value: string): value is OtpChannelState {
  return [
    'DISABLED',
    'STARTING',
    'QR_REQUIRED',
    'CONNECTED',
    'DISCONNECTED',
    'FAULTED',
    'STALE',
  ].includes(value);
}
