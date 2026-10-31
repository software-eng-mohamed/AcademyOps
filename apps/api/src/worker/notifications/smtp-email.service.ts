import { createHash } from 'node:crypto';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type SMTPPool from 'nodemailer/lib/smtp-pool';
import { z } from 'zod';
import {
  type EmailDeliveryResult,
  type EmailMessage,
  type EmailProvider,
  PermanentEmailError,
  RetryableEmailError,
} from './email-provider';
import { EmailDeliveryLedgerService } from './email-delivery-ledger.service';

const messageSchema = z.object({
  to: z.string().email().max(254),
  subject: z.string().min(1).max(500).refine(noNewlines),
  html: z.string().min(1).max(512_000),
  text: z.string().min(1).max(256_000),
  idempotencyKey: z.string().min(1).max(256).refine(noNewlines),
});

type SmtpFailure = Error & {
  code?: string;
  responseCode?: number;
};

@Injectable()
export class SmtpEmailService implements EmailProvider, OnModuleDestroy {
  private readonly transport: Transporter<SMTPPool.SentMessageInfo, SMTPPool.Options> | undefined;
  private readonly from: { address: string; name: string } | undefined;
  private readonly returnPath: string | undefined;
  private readonly messageDomain: string | undefined;

  constructor(
    config: ConfigService,
    private readonly ledger: EmailDeliveryLedgerService,
  ) {
    const host = value(config, 'SMTP_HOST');
    const fromAddress = value(config, 'SMTP_FROM_EMAIL');
    if (!host || !fromAddress) return;

    const username = value(config, 'SMTP_USERNAME');
    const password = value(config, 'SMTP_PASSWORD');
    const secure = config.get<boolean>('SMTP_SECURE') ?? false;
    const requireTls = config.get<boolean>('SMTP_REQUIRE_TLS') ?? true;
    const tlsServername = value(config, 'SMTP_TLS_SERVERNAME') ?? host;
    this.from = {
      address: fromAddress,
      name: value(config, 'SMTP_FROM_NAME') ?? 'AcademyOps',
    };
    this.returnPath = value(config, 'SMTP_RETURN_PATH');
    this.messageDomain = fromAddress.split('@')[1];
    const transportOptions: SMTPPool.Options & { maxRequeues: number } = {
      host,
      port: config.get<number>('SMTP_PORT') ?? 587,
      secure,
      requireTLS: requireTls,
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      maxRequeues: 0,
      rateDelta: 1_000,
      rateLimit: 10,
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
      dnsTimeout: 5_000,
      auth: username && password ? { user: username, pass: password } : undefined,
      tls: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true,
        servername: tlsServername,
      },
      disableFileAccess: true,
      disableUrlAccess: true,
      logger: false,
      debug: false,
    };
    this.transport = nodemailer.createTransport(transportOptions);
  }

  async send(input: EmailMessage): Promise<EmailDeliveryResult> {
    if (!this.transport || !this.from || !this.messageDomain) return 'disabled';
    const parsed = messageSchema.safeParse(input);
    if (!parsed.success) throw new PermanentEmailError('EMAIL_MESSAGE_INVALID');
    const transport = this.transport;
    const from = this.from;
    const messageDomain = this.messageDomain;
    return this.ledger.once(input.idempotencyKey, () =>
      this.deliver(parsed.data, transport, from, messageDomain),
    );
  }

  onModuleDestroy(): void {
    this.transport?.close();
  }

  private async deliver(
    input: EmailMessage,
    transport: Transporter<SMTPPool.SentMessageInfo, SMTPPool.Options>,
    from: { address: string; name: string },
    messageDomain: string,
  ): Promise<'sent'> {
    const deliveryId = createHash('sha256').update(input.idempotencyKey).digest('hex');
    try {
      const result = await transport.sendMail({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        messageId: `<plg-${deliveryId}@${messageDomain}>`,
        headers: { 'X-PLG-Delivery-ID': deliveryId },
        envelope: {
          from: this.returnPath ?? from.address,
          to: input.to,
        },
      });
      const recipientAccepted = result.accepted.some(
        (address) => address.toLowerCase() === input.to.toLowerCase(),
      );
      if (!recipientAccepted) {
        throw new PermanentEmailError('SMTP_RECIPIENT_REJECTED');
      }
      return 'sent';
    } catch (error) {
      throw classifyFailure(error);
    }
  }
}

function classifyFailure(error: unknown): RetryableEmailError | PermanentEmailError {
  if (error instanceof RetryableEmailError || error instanceof PermanentEmailError) return error;
  const failure = error instanceof Error ? (error as SmtpFailure) : undefined;
  const responseCode = failure?.responseCode;
  if (responseCode && responseCode >= 400 && responseCode < 500) {
    return new RetryableEmailError('SMTP_TEMPORARY_FAILURE');
  }
  if (responseCode && responseCode >= 500) {
    return new PermanentEmailError('SMTP_PERMANENT_FAILURE');
  }
  if (
    failure?.code &&
    ['EAUTH', 'ENOAUTH', 'ECONFIG', 'EENVELOPE', 'EMESSAGE', 'EREQUIRETLS'].includes(failure.code)
  ) {
    return new PermanentEmailError('SMTP_CONFIGURATION_OR_MESSAGE_FAILURE');
  }
  return new RetryableEmailError('SMTP_NETWORK_OR_UNKNOWN_FAILURE');
}

function value(config: ConfigService, key: string): string | undefined {
  return config.get<string>(key)?.trim() || undefined;
}

function noNewlines(value: string): boolean {
  return !/[\r\n]/.test(value);
}
