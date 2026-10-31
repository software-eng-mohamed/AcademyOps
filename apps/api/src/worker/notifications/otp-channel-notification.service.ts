import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UnrecoverableError } from 'bullmq';
import { PrismaService } from '../../platform/database/prisma.service';
import type { InternalEventEnvelope } from '../../realtime/realtime.contracts';
import { EmailDeliveryLedgerService } from './email-delivery-ledger.service';
import { EMAIL_PROVIDER, type EmailProvider, PermanentEmailError } from './email-provider';
import { otpChannelAlertEmail } from './otp-channel-notification-email';
import { OtpChannelNotificationTargetService } from './otp-channel-notification-target.service';
import type {
  OtpChannelAlertBatch,
  OtpChannelAlertRecipient,
} from './otp-channel-notification.types';

@Injectable()
export class OtpChannelNotificationService {
  private readonly logger = new Logger(OtpChannelNotificationService.name);
  private readonly webOrigin: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly targets: OtpChannelNotificationTargetService,
    private readonly ledger: EmailDeliveryLedgerService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    config: ConfigService,
  ) {
    this.webOrigin = config.getOrThrow<string>('WEB_ORIGIN');
  }

  async persist(event: InternalEventEnvelope): Promise<OtpChannelAlertBatch | null> {
    const batch = await this.targets.resolve(event);
    if (!batch) return null;
    await this.prisma.serializable(async (transaction) => {
      for (const recipient of batch.recipients) {
        const eventKey = `otp-channel:${batch.eventId}:${recipient.userId}`;
        await transaction.userNotification.upsert({
          where: {
            organizationId_userId_eventKey: {
              organizationId: batch.organizationId,
              userId: recipient.userId,
              eventKey,
            },
          },
          update: {},
          create: {
            organizationId: batch.organizationId,
            userId: recipient.userId,
            eventKey,
            type: `OTP_CHANNEL_${batch.payload.type}`,
            subjectType: 'WhatsappOtpChannel',
            subjectId: batch.payload.channelId,
            payload: batch.payload,
          },
        });
      }
    });
    return batch;
  }

  async deliverEmails(batch: OtpChannelAlertBatch): Promise<void> {
    const recipients = batch.recipients.filter(
      (recipient): recipient is OtpChannelAlertRecipient & { email: string } =>
        recipient.email !== null,
    );
    for (let index = 0; index < recipients.length; index += 5) {
      await Promise.all(
        recipients.slice(index, index + 5).map((recipient) => this.deliverOne(batch, recipient)),
      );
    }
  }

  private async deliverOne(
    batch: OtpChannelAlertBatch,
    recipient: OtpChannelAlertRecipient & { email: string },
  ): Promise<void> {
    const dashboardUrl = new URL('/en/whatsapp', this.webOrigin).toString();
    const content = otpChannelAlertEmail(batch.payload, dashboardUrl);
    try {
      await this.ledger.once(`otp-channel:${batch.eventId}:${recipient.userId}`, () =>
        this.email.send({
          to: recipient.email,
          ...content,
          idempotencyKey: `plg-otp-channel-${batch.eventId}-${recipient.userId}`,
        }),
      );
    } catch (error) {
      if (error instanceof PermanentEmailError) {
        this.logger.warn('Permanent OTP channel alert email failure');
        throw new UnrecoverableError('PERMANENT_OTP_CHANNEL_ALERT_EMAIL_FAILURE');
      }
      throw error;
    }
  }
}
