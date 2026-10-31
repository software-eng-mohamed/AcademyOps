import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PermanentEmailError,
  RetryableEmailError,
} from '../src/worker/notifications/email-provider';
import type { EmailDeliveryLedgerService } from '../src/worker/notifications/email-delivery-ledger.service';
import { SmtpEmailService } from '../src/worker/notifications/smtp-email.service';

const mailer = vi.hoisted(() => ({
  close: vi.fn(),
  createTransport: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: mailer.createTransport,
  },
}));

describe('SmtpEmailService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses authenticated pooled SMTP, TLS validation, and a deterministic message ID', async () => {
    mailer.sendMail.mockResolvedValue({ accepted: ['student@example.com'], rejected: [] });
    const service = configuredService();

    await expect(service.send(emailInput())).resolves.toBe('sent');
    const options: unknown = mailer.createTransport.mock.calls[0]?.[0];
    if (!isRecord(options) || !isRecord(options.tls)) throw new Error('Expected SMTP options');
    expect(options).toMatchObject({
      host: 'mail.example.com',
      port: 587,
      secure: false,
      requireTLS: true,
      pool: true,
      maxConnections: 5,
      maxRequeues: 0,
      auth: { user: 'postal-user', pass: 'postal-password' },
      logger: false,
      debug: false,
    });
    expect(options.tls).toMatchObject({ rejectUnauthorized: true, minVersion: 'TLSv1.2' });
    const rawMessage: unknown = mailer.sendMail.mock.calls[0]?.[0];
    if (!isRecord(rawMessage)) throw new Error('Expected an email message');
    const message = rawMessage;
    expect(message).toMatchObject({
      from: { address: 'no-reply@notify.example.com', name: 'AcademyOps' },
      to: 'student@example.com',
      envelope: { from: 'bounce@notify.example.com', to: 'student@example.com' },
    });
    expect(message.messageId).toMatch(/^<plg-[a-f0-9]{64}@notify\.example\.com>$/);

    mailer.sendMail.mockResolvedValue({ accepted: ['student@example.com'], rejected: [] });
    await service.send(emailInput());
    expect(mailer.sendMail.mock.calls[1]?.[0]).toMatchObject({
      messageId: message.messageId,
      headers: message.headers,
    });
  });

  it('classifies 4xx as retryable and 5xx/auth failures as permanent', async () => {
    mailer.sendMail.mockRejectedValueOnce(smtpError('busy', 'EMESSAGE', 450));
    await expect(configuredService().send(emailInput())).rejects.toBeInstanceOf(
      RetryableEmailError,
    );
    mailer.sendMail.mockRejectedValueOnce(smtpError('mailbox unavailable', 'EMESSAGE', 550));
    await expect(configuredService().send(emailInput())).rejects.toBeInstanceOf(
      PermanentEmailError,
    );
    mailer.sendMail.mockRejectedValueOnce(smtpError('bad credentials', 'EAUTH'));
    await expect(configuredService().send(emailInput())).rejects.toBeInstanceOf(
      PermanentEmailError,
    );
  });

  it('does not leak provider responses and treats network failures as retryable', async () => {
    mailer.sendMail.mockRejectedValue(smtpError('contains recipient@example.com', 'ETIMEDOUT'));
    const error = await configuredService()
      .send(emailInput())
      .catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(RetryableEmailError);
    expect((error as Error).message).toBe('SMTP_NETWORK_OR_UNKNOWN_FAILURE');
  });

  it('rejects unsafe headers and rejected recipients permanently', async () => {
    mailer.sendMail.mockResolvedValue({ accepted: [], rejected: ['student@example.com'] });
    await expect(configuredService().send(emailInput())).rejects.toBeInstanceOf(
      PermanentEmailError,
    );
    await expect(
      configuredService().send({ ...emailInput(), subject: 'Hello\r\nBcc: attacker@example.com' }),
    ).rejects.toBeInstanceOf(PermanentEmailError);
  });

  it('stays disabled without a complete host and sender configuration', async () => {
    const service = new SmtpEmailService(
      new ConfigService({
        SMTP_HOST: 'mail.example.com',
        SMTP_FROM_EMAIL: '',
      }),
      ledger(),
    );
    await expect(service.send(emailInput())).resolves.toBe('disabled');
    expect(mailer.createTransport).not.toHaveBeenCalled();
  });

  it('closes the SMTP pool during graceful worker shutdown', () => {
    const service = configuredService();
    service.onModuleDestroy();
    expect(mailer.close).toHaveBeenCalledOnce();
  });
});

function configuredService(): SmtpEmailService {
  mailer.createTransport.mockReturnValue({ sendMail: mailer.sendMail, close: mailer.close });
  return new SmtpEmailService(
    new ConfigService({
      SMTP_HOST: 'mail.example.com',
      SMTP_PORT: 587,
      SMTP_SECURE: false,
      SMTP_REQUIRE_TLS: true,
      SMTP_USERNAME: 'postal-user',
      SMTP_PASSWORD: 'postal-password',
      SMTP_FROM_EMAIL: 'no-reply@notify.example.com',
      SMTP_FROM_NAME: 'AcademyOps',
      SMTP_RETURN_PATH: 'bounce@notify.example.com',
    }),
    ledger(),
  );
}

function ledger(): EmailDeliveryLedgerService {
  return {
    once: vi.fn(async (_key: string, operation: () => Promise<'sent' | 'disabled'>) => operation()),
  } as unknown as EmailDeliveryLedgerService;
}

function emailInput() {
  return {
    to: 'student@example.com',
    subject: 'Session changed',
    html: '<p>Session changed</p>',
    text: 'Session changed',
    idempotencyKey: 'plg-session-event-user',
  };
}

function smtpError(message: string, code: string, responseCode?: number): Error {
  return Object.assign(new Error(message), { code, responseCode });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
