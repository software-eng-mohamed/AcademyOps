import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../platform/database/prisma.service';
import { developmentErrorStack } from '../../platform/logging/safe-error';

@Injectable()
export class SecurityOutboxRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SecurityOutboxRetentionService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.run(), 60 * 60 * 1_000);
    this.timer.unref();
    void this.run();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async run(): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        UPDATE outbox_events
        SET payload = '{"redacted":true}'::jsonb
        WHERE processed_at < clock_timestamp() - INTERVAL '1 hour'
          AND type IN ('security.password_reset_requested', 'security.phone_otp_requested')
          AND payload <> '{"redacted":true}'::jsonb
      `;
    } catch (error) {
      this.logger.error('Security outbox redaction failed', developmentErrorStack(error));
    }
  }
}
