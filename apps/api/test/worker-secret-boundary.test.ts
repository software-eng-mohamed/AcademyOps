import type { Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../src/platform/database/prisma.service';
import { FileStorageService } from '../src/platform/files/file-storage.service';
import { RealtimePublisherService } from '../src/realtime/realtime-publisher.service';
import { AttendanceMaintenanceService } from '../src/worker/attendance-maintenance.service';
import { DomainEventWorkerService } from '../src/worker/domain-event-worker.service';
import { EmailDeliveryLedgerService } from '../src/worker/notifications/email-delivery-ledger.service';
import { OtpChannelNotificationService } from '../src/worker/notifications/otp-channel-notification.service';
import { SessionNotificationService } from '../src/worker/notifications/session-notification.service';
import { SmtpEmailService } from '../src/worker/notifications/smtp-email.service';
import { WorkerMetricsHttpService } from '../src/worker/observability/worker-metrics-http.service';
import { OutboxDispatcherService } from '../src/worker/outbox-dispatcher.service';
import { SecurityDeliveryLedgerService } from '../src/worker/security/security-delivery-ledger.service';
import { SecurityDeliveryService } from '../src/worker/security/security-delivery.service';
import { SecurityOutboxRetentionService } from '../src/worker/security/security-outbox-retention.service';

const apiOnlySecrets = [
  'SESSION_PEPPER',
  'QR_HMAC_SECRET',
  'FILE_SIGNING_SECRET',
  'MFA_ENCRYPTION_KEY',
  'MFA_RECOVERY_PEPPER',
  'PASSWORD_RESET_PEPPER',
  'PHONE_OTP_PEPPER',
  'WHATSAPP_AUTH_ENCRYPTION_KEY',
] as const;

afterEach(() => vi.unstubAllEnvs());

describe('worker secret boundary', () => {
  it('boots WorkerModule without API-only secrets', async () => {
    stubWorkerEnvironment();
    const { WorkerModule } = await vi.importActual<{ WorkerModule: Type<unknown> }>(
      '../src/worker.module',
    );
    const inertLifecycle = { onModuleDestroy: vi.fn(), onModuleInit: vi.fn() };
    const builder = Test.createTestingModule({ imports: [WorkerModule] });
    for (const provider of [
      PrismaService,
      FileStorageService,
      RealtimePublisherService,
      AttendanceMaintenanceService,
      DomainEventWorkerService,
      EmailDeliveryLedgerService,
      OtpChannelNotificationService,
      SessionNotificationService,
      SmtpEmailService,
      WorkerMetricsHttpService,
      OutboxDispatcherService,
      SecurityDeliveryLedgerService,
      SecurityDeliveryService,
      SecurityOutboxRetentionService,
    ]) {
      builder.overrideProvider(provider).useValue(inertLifecycle);
    }
    const moduleRef = await builder.compile();
    await moduleRef.init();
    try {
      const config = moduleRef.get(ConfigService);
      expect(config.get('ACTION_TOKEN_ENCRYPTION_KEY')).toBe('c'.repeat(64));
      expect(config.get('OTP_CONNECTOR_INTERNAL_TOKEN')).toBe('d'.repeat(64));
      expect(config.get('OTP_CONNECTOR_URL')).toBe('http://otp-connector:3002');
      for (const secret of apiOnlySecrets) expect(config.get(secret)).toBeFalsy();
    } finally {
      await moduleRef.close();
    }
  });
});

function stubWorkerEnvironment(): void {
  const environment = {
    NODE_ENV: 'production',
    SERVICE_ROLE: 'worker',
    DATABASE_URL: 'postgresql://worker:password@database.invalid/academy',
    REDIS_URL: 'redis://:password@redis.invalid:6379',
    WEB_ORIGIN: 'https://academy.example.com',
    PAYMOB_BASE_URL: 'https://accept.paymob.com',
    METRICS_TOKEN: 'b'.repeat(64),
    ACTION_TOKEN_ENCRYPTION_KEY: 'c'.repeat(64),
    OTP_CONNECTOR_INTERNAL_TOKEN: 'd'.repeat(64),
    OTP_CONNECTOR_URL: 'http://otp-connector:3002',
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '587',
    SMTP_SECURE: 'false',
    SMTP_REQUIRE_TLS: 'true',
    SMTP_USERNAME: 'worker',
    SMTP_PASSWORD: 'smtp-password',
    SMTP_FROM_EMAIL: 'no-reply@example.com',
    SMTP_RETURN_PATH: 'bounce@example.com',
    R2_ENDPOINT: 'https://r2.example.com',
    R2_ACCESS_KEY_ID: 'worker-access',
    R2_SECRET_ACCESS_KEY: 'worker-secret',
    R2_BUCKET: 'private-files',
  };
  for (const [key, value] of Object.entries(environment)) vi.stubEnv(key, value);
  // Do not inherit API-only checkout callbacks from the developer's local .env.
  // The worker deliberately boots without the Paymob HTTP surface.
  vi.stubEnv('PAYMOB_NOTIFICATION_URL', '');
  vi.stubEnv('PAYMOB_REDIRECTION_URL', '');
  for (const key of apiOnlySecrets) vi.stubEnv(key, '');
}
