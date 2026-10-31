import { Inject, Injectable, Logger } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { PrismaService } from '../../platform/database/prisma.service';
import type { InternalEventEnvelope } from '../../realtime/realtime.contracts';
import { EMAIL_PROVIDER, type EmailProvider, PermanentEmailError } from './email-provider';
import { sessionEmailContent } from './session-notification-email';
import { SessionNotificationTargetService } from './session-notification-target.service';
import type {
  SessionNotificationBatch,
  SessionNotificationContext,
  SessionNotificationRecipient,
} from './session-notification.types';

@Injectable()
export class SessionNotificationService {
  private readonly logger = new Logger(SessionNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly targets: SessionNotificationTargetService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
  ) {}

  async persist(event: InternalEventEnvelope): Promise<SessionNotificationBatch | null> {
    const context = await this.targets.resolve(event);
    if (!context) return null;
    const eventKeyByUser = new Map<string, string>();
    await this.prisma.serializable(async (transaction) => {
      for (const recipient of context.recipients) {
        const eventKey = `session:${context.eventId}:${recipient.userId}`;
        eventKeyByUser.set(recipient.userId, eventKey);
        await transaction.userNotification.upsert({
          where: {
            organizationId_userId_eventKey: {
              organizationId: context.organizationId,
              userId: recipient.userId,
              eventKey,
            },
          },
          update: {},
          create: {
            organizationId: context.organizationId,
            userId: recipient.userId,
            eventKey,
            type: `SESSION_${context.payload.type}`,
            subjectType: 'Session',
            subjectId: context.payload.sessionId,
            payload: context.payload,
          },
        });
      }
    });
    return { ...context, eventKeyByUser };
  }

  async deliverEmails(batch: SessionNotificationBatch): Promise<void> {
    const deliverable = batch.recipients.filter(
      (recipient): recipient is SessionNotificationRecipient & { email: string } =>
        recipient.email !== null,
    );
    const retryableFailures: unknown[] = [];
    let permanentFailures = 0;
    for (let index = 0; index < deliverable.length; index += 5) {
      const outcomes = await Promise.allSettled(
        deliverable.slice(index, index + 5).map((recipient) => this.deliverOne(batch, recipient)),
      );
      for (const outcome of outcomes) {
        if (outcome.status === 'fulfilled') continue;
        if (outcome.reason instanceof PermanentEmailError) permanentFailures += 1;
        else retryableFailures.push(outcome.reason);
      }
    }
    if (permanentFailures) this.logger.warn('Permanent session notification email failure');
    // A permanent failure must not prevent retries for other recipients. The provider's
    // per-recipient delivery ledger suppresses terminal deliveries on those retries.
    if (retryableFailures.length) throw retryableFailures[0];
    if (permanentFailures) {
      throw new UnrecoverableError('PERMANENT_SESSION_NOTIFICATION_EMAIL_FAILURE');
    }
  }

  private async deliverOne(
    batch: SessionNotificationContext,
    recipient: SessionNotificationRecipient & { email: string },
  ): Promise<void> {
    const content = sessionEmailContent(batch.payload);
    await this.email.send({
      to: recipient.email,
      ...content,
      idempotencyKey: `plg-session-${batch.eventId}-${recipient.userId}`,
    });
  }
}
