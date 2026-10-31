import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import type { PrismaService } from '../src/platform/database/prisma.service';
import type { ReportExportWorkerService } from '../src/reporting/report-export-worker.service';
import type { RealtimePublisherService } from '../src/realtime/realtime-publisher.service';
import {
  internalEnvelopeFrom,
  type InternalEventEnvelope,
} from '../src/realtime/realtime.contracts';
import { encryptActionToken } from '../src/iam/auth/action-token';
import { DomainEventProcessorService } from '../src/worker/domain-event-processor.service';
import type { EmailProvider } from '../src/worker/notifications/email-provider';
import type { SessionNotificationService } from '../src/worker/notifications/session-notification.service';
import type { SecurityDeliveryLedgerService } from '../src/worker/security/security-delivery-ledger.service';
import { SecurityDeliveryService } from '../src/worker/security/security-delivery.service';
import type { OtpMessageProvider } from '../src/messaging/otp-message-provider';
import { PermanentOtpDeliveryError } from '../src/messaging/otp-message-provider';
import type { OtpChannelNotificationService } from '../src/worker/notifications/otp-channel-notification.service';
import { describe, expect, it, vi } from 'vitest';

const actionKey = 'test-action-token-key-at-least-32-bytes';

describe('security delivery pipeline', () => {
  it('decrypts a reset token only for a stable idempotent email request', async () => {
    const email = { send: vi.fn().mockResolvedValue('sent') };
    const ledger = memoryLedger();
    const service = securityService(email, { send: vi.fn() }, ledger);
    const event = passwordEvent();

    await service.deliver(event);
    await service.deliver(event);

    expect(email.send).toHaveBeenCalledOnce();
    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'student@example.com',
        idempotencyKey: 'plg-password-reset-event-reset-user-a',
      }),
    );
    const request = email.send.mock.calls[0]?.[0] as { text: string };
    expect(decodeURIComponent(request.text)).toContain('reset-token<&value');
    const resetLink = request.text.match(/https:\/\/[^\s]+/)?.[0];
    expect(resetLink).toBeDefined();
    const resetUrl = new URL(resetLink!);
    expect(resetUrl.search).toBe('');
    expect(resetUrl.hash).toContain('organizationCode=PLG');
    expect(resetUrl.hash).toContain('token=');
    expect(ledger.once).toHaveBeenCalledWith('event-reset', 'email', expect.any(Function));
    const cipher = (event.payload as { tokenCipher: string }).tokenCipher;
    expect(JSON.stringify(email.send.mock.calls)).not.toContain(cipher);
  });

  it('decrypts the OTP and sends it only to the matching E.164 identifier', async () => {
    const messages = { send: vi.fn().mockResolvedValue(undefined) };
    const ledger = memoryLedger();
    const service = securityService({ send: vi.fn() }, messages, ledger);

    await service.deliver(phoneEvent());

    const request = messages.send.mock.calls[0]?.[0] as {
      organizationId: string;
      to: string;
      body: string;
    };
    expect(request.organizationId).toBe('org-a');
    expect(request.to).toBe('+201234567890');
    expect(request.body).toContain('654321');
    expect(ledger.once).toHaveBeenCalledWith('event-otp', 'whatsapp', expect.any(Function));
  });

  it('delivers a password reset link to a verified phone over WhatsApp', async () => {
    const messages = { send: vi.fn().mockResolvedValue(undefined) };
    const ledger = memoryLedger();
    const service = securityService({ send: vi.fn() }, messages, ledger);

    await service.deliver(phonePasswordResetEvent());

    const request = messages.send.mock.calls[0]?.[0] as {
      organizationId: string;
      to: string;
      body: string;
    };
    expect(request.organizationId).toBe('org-a');
    expect(request.to).toBe('+201234567890');
    expect(decodeURIComponent(request.body)).toContain('/ar/reset-password#');
    expect(request.body).toContain('token=');
    expect(ledger.once).toHaveBeenCalledWith('event-phone-reset', 'whatsapp', expect.any(Function));
  });

  it('routes a full outbox envelope to security delivery without realtime publication', async () => {
    const security = {
      supports: vi.fn().mockReturnValue(true),
      deliver: vi.fn().mockResolvedValue(undefined),
    };
    const realtime = { publish: vi.fn() };
    const sessions = { persist: vi.fn().mockResolvedValue(null), deliverEmails: vi.fn() };
    const otpChannelAlerts = { persist: vi.fn().mockResolvedValue(null), deliverEmails: vi.fn() };
    const processor = new DomainEventProcessorService(
      {} as ReportExportWorkerService,
      realtime as unknown as RealtimePublisherService,
      sessions as unknown as SessionNotificationService,
      otpChannelAlerts as unknown as OtpChannelNotificationService,
      security as unknown as SecurityDeliveryService,
    );
    const envelope = internalEnvelopeFrom({
      id: 'event-reset',
      type: 'security.password_reset_requested',
      organizationId: 'org-a',
      aggregateType: 'User',
      aggregateId: 'user-a',
      occurredAt: new Date('2026-08-11T10:00:00.000Z'),
      payload: { tokenCipher: 'internal-only' },
    });

    await processor.process(envelope.type, envelope, envelope.eventId);

    expect(security.deliver).toHaveBeenCalledWith(envelope);
    expect(realtime.publish).not.toHaveBeenCalled();
  });

  it('surfaces permanent provider failures without logging the code or recipient', async () => {
    const warning = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const messages = {
      send: vi.fn().mockRejectedValue(new PermanentOtpDeliveryError('RECIPIENT_REJECTED')),
    };
    const service = securityService({ send: vi.fn() }, messages, memoryLedger());

    await expect(service.deliver(phoneEvent())).rejects.toBeInstanceOf(UnrecoverableError);
    expect(warning).toHaveBeenCalledWith('Permanent security message delivery failure');
    expect(JSON.stringify(warning.mock.calls)).not.toContain('654321');
    expect(JSON.stringify(warning.mock.calls)).not.toContain('+201234567890');
    warning.mockRestore();
  });

  it('delivers phone OTP to email fallback and survives WhatsApp failure when email succeeds', async () => {
    const email = { send: vi.fn().mockResolvedValue('sent') };
    const messages = { send: vi.fn().mockRejectedValue(new Error('OTP_CHANNEL_NOT_READY')) };
    const ledger = memoryLedger();
    const prisma = {
      organization: { findUnique: vi.fn().mockResolvedValue({ code: 'PLG' }) },
      user: { findFirst: vi.fn().mockResolvedValue({ id: 'user-a', preferredLocale: 'ar' }) },
      userLoginIdentifier: {
        findFirst: vi.fn().mockImplementation(({ where }: { where: { type: string } }) => {
          if (where.type === 'PHONE') return Promise.resolve({ id: 'ident-phone' });
          if (where.type === 'EMAIL')
            return Promise.resolve({ id: 'ident-email', normalizedValue: 'fallback@example.com' });
          return Promise.resolve(null);
        }),
      },
    };
    const service = new SecurityDeliveryService(
      prisma as unknown as PrismaService,
      new ConfigService({
        ACTION_TOKEN_ENCRYPTION_KEY: actionKey,
        WEB_ORIGIN: 'https://web.example',
      }),
      email,
      messages,
      ledger as unknown as SecurityDeliveryLedgerService,
    );

    await expect(service.deliver(phoneEvent())).resolves.toBeUndefined();
    expect(email.send).toHaveBeenCalledOnce();
    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'fallback@example.com',
        idempotencyKey: 'plg-phone-otp-event-otp-user-a',
      }),
    );
    const emailCall = email.send.mock.calls[0]?.[0] as { text: string };
    expect(emailCall.text).toContain('654321');
  });

  it('rejects expired payloads before decrypting or calling a provider', async () => {
    const email = { send: vi.fn() };
    const service = securityService(email, { send: vi.fn() }, memoryLedger());
    const event = passwordEvent();
    event.payload = { ...(event.payload as object), expiresAt: '2020-01-01T00:00:00.000Z' };

    await expect(service.deliver(event)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(email.send).not.toHaveBeenCalled();
  });
});

function securityService(
  email: { send: ReturnType<typeof vi.fn> },
  messages: { send: ReturnType<typeof vi.fn> },
  ledger: ReturnType<typeof memoryLedger>,
): SecurityDeliveryService {
  const prisma = {
    organization: { findUnique: vi.fn().mockResolvedValue({ code: 'PLG' }) },
    user: { findFirst: vi.fn().mockResolvedValue({ id: 'user-a' }) },
    userLoginIdentifier: { findFirst: vi.fn().mockResolvedValue({ id: 'identifier-a' }) },
  };
  return new SecurityDeliveryService(
    prisma as unknown as PrismaService,
    new ConfigService({
      ACTION_TOKEN_ENCRYPTION_KEY: actionKey,
      WEB_ORIGIN: 'https://web.example',
    }),
    email as unknown as EmailProvider,
    messages as unknown as OtpMessageProvider,
    ledger as unknown as SecurityDeliveryLedgerService,
  );
}

function memoryLedger() {
  const completed = new Set<string>();
  return {
    once: vi.fn(
      async (
        eventId: string,
        channel: 'email' | 'whatsapp',
        operation: () => Promise<'sent' | 'disabled'>,
      ) => {
        const key = `${channel}:${eventId}`;
        if (completed.has(key)) return 'duplicate' as const;
        const result = await operation();
        if (result === 'sent') completed.add(key);
        return result;
      },
    ),
  };
}

function passwordEvent(): InternalEventEnvelope {
  return {
    v: 1,
    eventId: 'event-reset',
    type: 'security.password_reset_requested',
    organizationId: 'org-a',
    aggregate: { type: 'User', id: 'user-a' },
    occurredAt: new Date().toISOString(),
    payload: {
      userId: 'user-a',
      email: 'student@example.com',
      locale: 'en',
      tokenCipher: encryptActionToken('reset-token<&value', actionKey),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
  };
}

function phoneEvent(): InternalEventEnvelope {
  return {
    v: 1,
    eventId: 'event-otp',
    type: 'security.phone_otp_requested',
    organizationId: 'org-a',
    aggregate: { type: 'User', id: 'user-a' },
    occurredAt: new Date().toISOString(),
    payload: {
      userId: 'user-a',
      phone: '+201234567890',
      codeCipher: encryptActionToken('654321', actionKey),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
  };
}

function phonePasswordResetEvent(): InternalEventEnvelope {
  return {
    v: 1,
    eventId: 'event-phone-reset',
    type: 'security.password_reset_requested',
    organizationId: 'org-a',
    aggregate: { type: 'User', id: 'user-a' },
    occurredAt: new Date().toISOString(),
    payload: {
      userId: 'user-a',
      identifierType: 'PHONE',
      locale: 'ar',
      recipient: '+201234567890',
      tokenCipher: encryptActionToken('phone-reset-token<&value', actionKey),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
  };
}
