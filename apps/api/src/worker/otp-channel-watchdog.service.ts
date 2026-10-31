import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../platform/database/prisma.service';
import { OutboxService } from '../platform/outbox/outbox.service';

const STALE_AFTER_MS = 75_000;

@Injectable()
export class OtpChannelWatchdogService implements OnModuleInit, OnModuleDestroy {
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  onModuleInit(): void {
    this.interval = setInterval(() => void this.inspect(), 30_000);
    this.interval.unref();
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  async inspect(now = new Date()): Promise<void> {
    const cutoff = new Date(now.getTime() - STALE_AFTER_MS);
    const candidates = await this.prisma.whatsappOtpChannel.findMany({
      where: {
        enabled: true,
        state: 'CONNECTED',
        OR: [{ lastHeartbeatAt: null }, { lastHeartbeatAt: { lt: cutoff } }],
      },
      select: { id: true, organizationId: true },
      take: 100,
    });
    for (const channel of candidates) await this.markStale(channel, cutoff, now);
  }

  private async markStale(
    channel: { id: string; organizationId: string },
    cutoff: Date,
    now: Date,
  ): Promise<void> {
    await this.prisma.serializable(async (transaction) => {
      const changed = await transaction.whatsappOtpChannel.updateMany({
        where: {
          id: channel.id,
          enabled: true,
          state: 'CONNECTED',
          OR: [{ lastHeartbeatAt: null }, { lastHeartbeatAt: { lt: cutoff } }],
        },
        data: {
          state: 'STALE',
          lastErrorCode: 'OTP_CONNECTOR_HEARTBEAT_STALE',
          lastDisconnectedAt: now,
          version: { increment: 1 },
        },
      });
      if (!changed.count) return;
      await this.outbox.add(transaction, {
        organizationId: channel.organizationId,
        aggregateType: 'WhatsappOtpChannel',
        aggregateId: channel.id,
        type: 'messaging.otp_channel.unavailable',
        payload: {
          channelId: channel.id,
          state: 'STALE',
          errorCode: 'OTP_CONNECTOR_HEARTBEAT_STALE',
        },
      });
    });
  }
}
