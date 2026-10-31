import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UnrecoverableError } from 'bullmq';
import { decryptActionToken } from '../../iam/auth/action-token';
import {
  OTP_MESSAGE_PROVIDER,
  type OtpMessageProvider,
  PermanentOtpDeliveryError,
} from '../../messaging/otp-message-provider';
import { PrismaService } from '../../platform/database/prisma.service';
import type { InternalEventEnvelope } from '../../realtime/realtime.contracts';
import {
  EMAIL_PROVIDER,
  type EmailProvider,
  PermanentEmailError,
} from '../notifications/email-provider';
import { SecurityDeliveryLedgerService } from './security-delivery-ledger.service';
import {
  passwordResetEmail,
  passwordResetWhatsapp,
  phoneOtpEmail,
  phoneOtpWhatsapp,
} from './security-message-template';

type PasswordResetPayload = {
  userId: string;
  identifierType: 'EMAIL' | 'PHONE';
  locale: 'ar' | 'en';
  recipient: string;
  tokenCipher: string;
  expiresAt: Date;
};
type PhoneOtpPayload = { userId: string; phone: string; codeCipher: string; expiresAt: Date };

class PermanentSecurityMessageError extends Error {}

@Injectable()
export class SecurityDeliveryService {
  private readonly logger = new Logger(SecurityDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    @Inject(OTP_MESSAGE_PROVIDER) private readonly otpMessages: OtpMessageProvider,
    private readonly ledger: SecurityDeliveryLedgerService,
  ) {}

  supports(type: string): boolean {
    return type === 'security.password_reset_requested' || type === 'security.phone_otp_requested';
  }

  async deliver(event: InternalEventEnvelope): Promise<void> {
    try {
      if (event.type === 'security.password_reset_requested') {
        await this.passwordReset(event);
      } else if (event.type === 'security.phone_otp_requested') {
        await this.phoneOtp(event);
      }
    } catch (error) {
      if (
        error instanceof PermanentSecurityMessageError ||
        error instanceof PermanentEmailError ||
        error instanceof PermanentOtpDeliveryError
      ) {
        this.logger.warn('Permanent security message delivery failure');
        throw new UnrecoverableError('PERMANENT_SECURITY_MESSAGE_DELIVERY_FAILURE');
      }
      throw error;
    }
  }

  private async passwordReset(event: InternalEventEnvelope): Promise<void> {
    const payload = this.passwordPayload(event);
    const [organization, user, identifier, emailIdentifier] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: event.organizationId },
        select: { code: true },
      }),
      this.prisma.user.findFirst({
        where: { organizationId: event.organizationId, id: payload.userId, status: 'ACTIVE' },
        select: { id: true },
      }),
      this.prisma.userLoginIdentifier.findFirst({
        where: {
          organizationId: event.organizationId,
          userId: payload.userId,
          type: payload.identifierType,
          normalizedValue: payload.recipient,
          verifiedAt: { not: null },
          revokedAt: null,
        },
        select: { id: true },
      }),
      payload.identifierType === 'PHONE'
        ? this.prisma.userLoginIdentifier.findFirst({
            where: {
              organizationId: event.organizationId,
              userId: payload.userId,
              type: 'EMAIL',
              revokedAt: null,
            },
            select: { normalizedValue: true },
          })
        : Promise.resolve(null),
    ]);
    if (!organization || !user || !identifier) throw this.permanent();
    const token = this.decrypt(payload.tokenCipher);
    const resetUrl = new URL(
      `/${payload.locale}/reset-password`,
      this.config.getOrThrow('WEB_ORIGIN'),
    );
    resetUrl.hash = new URLSearchParams({
      organizationCode: organization.code,
      token,
    }).toString();
    if (payload.identifierType === 'EMAIL') {
      const content = passwordResetEmail(resetUrl.toString(), payload.expiresAt, payload.locale);
      await this.ledger.once(event.eventId, 'email', () =>
        this.email.send({
          to: payload.recipient,
          ...content,
          idempotencyKey: `plg-password-reset-${event.eventId}-${payload.userId}`,
        }),
      );
      return;
    }
    const emailDelivered = emailIdentifier?.normalizedValue
      ? await this.sendEmailFallback(
          event.eventId,
          emailIdentifier.normalizedValue,
          `plg-password-reset-${event.eventId}-${payload.userId}`,
          passwordResetEmail(resetUrl.toString(), payload.expiresAt, payload.locale),
        )
      : false;
    await this.sendWhatsapp(
      event.eventId,
      event.organizationId,
      payload.recipient,
      passwordResetWhatsapp(resetUrl.toString(), payload.expiresAt, payload.locale),
      emailDelivered,
    );
  }

  private async phoneOtp(event: InternalEventEnvelope): Promise<void> {
    const payload = this.phonePayload(event);
    const [user, identifier, emailIdentifier] = await Promise.all([
      this.prisma.user.findFirst({
        where: { organizationId: event.organizationId, id: payload.userId, status: 'ACTIVE' },
        select: { id: true, preferredLocale: true },
      }),
      this.prisma.userLoginIdentifier.findFirst({
        where: {
          organizationId: event.organizationId,
          userId: payload.userId,
          type: 'PHONE',
          normalizedValue: payload.phone,
          revokedAt: null,
        },
        select: { id: true },
      }),
      this.prisma.userLoginIdentifier.findFirst({
        where: {
          organizationId: event.organizationId,
          userId: payload.userId,
          type: 'EMAIL',
          revokedAt: null,
        },
        select: { normalizedValue: true },
      }),
    ]);
    if (!user || !identifier) throw this.permanent();
    const code = this.decrypt(payload.codeCipher);
    if (!/^\d{6}$/.test(code)) throw this.permanent();
    const emailDelivered = emailIdentifier?.normalizedValue
      ? await this.sendEmailFallback(
          event.eventId,
          emailIdentifier.normalizedValue,
          `plg-phone-otp-${event.eventId}-${payload.userId}`,
          phoneOtpEmail(code, payload.expiresAt, user.preferredLocale === 'ar' ? 'ar' : 'en'),
        )
      : false;
    await this.sendWhatsapp(
      event.eventId,
      event.organizationId,
      payload.phone,
      phoneOtpWhatsapp(code),
      emailDelivered,
    );
  }

  private async sendEmailFallback(
    eventId: string,
    to: string,
    key: string,
    content: { subject: string; html: string; text: string },
  ): Promise<boolean> {
    try {
      const res = await this.ledger.once(eventId, 'email', () =>
        this.email.send({ to, ...content, idempotencyKey: key }),
      );
      return res === 'sent' || res === 'duplicate';
    } catch (err) {
      this.logger.warn(`Email fallback failed: ${String(err)}`);
      return false;
    }
  }

  private async sendWhatsapp(
    eventId: string,
    orgId: string,
    to: string,
    body: string,
    emailDelivered: boolean,
  ): Promise<void> {
    try {
      await this.ledger.once(eventId, 'whatsapp', async () => {
        await this.otpMessages.send({ organizationId: orgId, to, body, idempotencyKey: eventId });
        return 'sent';
      });
    } catch (err) {
      if (emailDelivered) {
        this.logger.warn(`WhatsApp delivery failed; relying on email: ${String(err)}`);
        return;
      }
      throw err;
    }
  }

  private passwordPayload(event: InternalEventEnvelope): PasswordResetPayload {
    const value = this.record(event.payload);
    const userId = this.userId(event, value.userId);
    const legacyEmail = typeof value.email === 'string' ? value.email.trim().toLowerCase() : '';
    const identifierType = value.identifierType === 'PHONE' ? 'PHONE' : 'EMAIL';
    const legacyLocale = value.preferredLocale === 'ar' ? 'ar' : 'en';
    const locale = value.locale === 'ar' || value.locale === 'en' ? value.locale : legacyLocale;
    const recipient = typeof value.recipient === 'string' ? value.recipient.trim() : legacyEmail;
    const tokenCipher = typeof value.tokenCipher === 'string' ? value.tokenCipher : '';
    const recipientValid =
      identifierType === 'PHONE'
        ? /^\+[1-9]\d{7,14}$/.test(recipient)
        : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient);
    if (!recipientValid || !tokenCipher) throw this.permanent();
    return {
      userId,
      identifierType,
      locale,
      recipient,
      tokenCipher,
      expiresAt: this.expiry(value.expiresAt),
    };
  }

  private phonePayload(event: InternalEventEnvelope): PhoneOtpPayload {
    const value = this.record(event.payload);
    const userId = this.userId(event, value.userId);
    const phone = typeof value.phone === 'string' ? value.phone : '';
    const codeCipher = typeof value.codeCipher === 'string' ? value.codeCipher : '';
    if (!/^\+[1-9]\d{7,14}$/.test(phone) || !codeCipher) throw this.permanent();
    return { userId, phone, codeCipher, expiresAt: this.expiry(value.expiresAt) };
  }

  private record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw this.permanent();
    return value as Record<string, unknown>;
  }

  private userId(event: InternalEventEnvelope, value: unknown): string {
    const valid =
      typeof event.organizationId === 'string' &&
      typeof event.eventId === 'string' &&
      typeof value === 'string' &&
      event.aggregate?.type === 'User' &&
      event.aggregate?.id === value;
    if (!valid) throw this.permanent();
    return value;
  }

  private expiry(value: unknown): Date {
    const date = typeof value === 'string' ? new Date(value) : new Date(Number.NaN);
    if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) throw this.permanent();
    return date;
  }

  private decrypt(ciphertext: string): string {
    try {
      return decryptActionToken(
        ciphertext,
        this.config.getOrThrow<string>('ACTION_TOKEN_ENCRYPTION_KEY'),
      );
    } catch {
      throw this.permanent();
    }
  }

  private permanent(): PermanentSecurityMessageError {
    return new PermanentSecurityMessageError('SECURITY_MESSAGE_INVALID');
  }
}
