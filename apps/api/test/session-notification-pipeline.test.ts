import { describe, expect, it, vi } from 'vitest';
import { UnrecoverableError } from 'bullmq';
import type { PrismaService } from '../src/platform/database/prisma.service';
import type { ReportExportWorkerService } from '../src/reporting/report-export-worker.service';
import type { RealtimePublisherService } from '../src/realtime/realtime-publisher.service';
import type { InternalEventEnvelope } from '../src/realtime/realtime.contracts';
import { DomainEventProcessorService } from '../src/worker/domain-event-processor.service';
import type { SessionNotificationService } from '../src/worker/notifications/session-notification.service';
import { SessionNotificationService as SessionNotifications } from '../src/worker/notifications/session-notification.service';
import type { SessionNotificationTargetService } from '../src/worker/notifications/session-notification-target.service';
import type { SessionNotificationBatch } from '../src/worker/notifications/session-notification.types';
import {
  PermanentEmailError,
  RetryableEmailError,
} from '../src/worker/notifications/email-provider';
import type { SecurityDeliveryService } from '../src/worker/security/security-delivery.service';
import type { OtpChannelNotificationService } from '../src/worker/notifications/otp-channel-notification.service';

describe('session notification worker pipeline', () => {
  it('persists site notifications, publishes realtime, then surfaces retryable email failures', async () => {
    const order: string[] = [];
    const batch = batchFixture();
    const notifications = {
      persist: vi.fn().mockImplementation(() => {
        order.push('site');
        return Promise.resolve(batch);
      }),
      deliverEmails: vi.fn().mockImplementation(() => {
        order.push('email');
        return Promise.reject(new RetryableEmailError('retry'));
      }),
    };
    const realtime = {
      publish: vi.fn().mockImplementation(() => {
        order.push('realtime');
        return Promise.resolve(true);
      }),
    };
    const processor = new DomainEventProcessorService(
      {} as ReportExportWorkerService,
      realtime as unknown as RealtimePublisherService,
      notifications as unknown as SessionNotificationService,
      {
        persist: vi.fn().mockResolvedValue(null),
        deliverEmails: vi.fn(),
      } as unknown as OtpChannelNotificationService,
      { supports: vi.fn().mockReturnValue(false) } as unknown as SecurityDeliveryService,
    );

    await expect(
      processor.process('session.rescheduled', envelopeFixture()),
    ).rejects.toBeInstanceOf(RetryableEmailError);
    expect(order).toEqual(['site', 'realtime', 'email']);
    expect(realtime.publish).toHaveBeenCalledWith(envelopeFixture(), ['person-a']);
  });

  it('preserves legacy report-export payload processing', async () => {
    const reports = { process: vi.fn().mockResolvedValue(undefined) };
    const notifications = { persist: vi.fn(), deliverEmails: vi.fn() };
    const realtime = { publish: vi.fn() };
    const processor = new DomainEventProcessorService(
      reports as unknown as ReportExportWorkerService,
      realtime as unknown as RealtimePublisherService,
      notifications as unknown as SessionNotificationService,
      {
        persist: vi.fn().mockResolvedValue(null),
        deliverEmails: vi.fn(),
      } as unknown as OtpChannelNotificationService,
      { supports: vi.fn().mockReturnValue(false) } as unknown as SecurityDeliveryService,
    );

    await processor.process('report.export.requested', { exportJobId: 'export-a' }, 'job-a');
    expect(reports.process).toHaveBeenCalledWith('export-a');
    expect(notifications.persist).not.toHaveBeenCalled();
    expect(realtime.publish).not.toHaveBeenCalled();
  });

  it('surfaces permanent provider failures as unrecoverable after persistence', async () => {
    const email = {
      send: vi.fn().mockRejectedValue(new PermanentEmailError('invalid recipient')),
    };
    const service = new SessionNotifications(
      {} as PrismaService,
      {} as SessionNotificationTargetService,
      email,
    );
    const batch = batchFixture();
    batch.recipients.push({
      userId: 'user-a',
      personId: 'person-a',
      locale: 'en',
      email: 'student@example.com',
    });

    await expect(service.deliverEmails(batch)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'plg-session-event-a-user-a' }),
    );
  });

  it('waits for each batch and attempts later recipients after a permanent failure', async () => {
    let release: () => void = () => undefined;
    const inFlight = new Promise<void>((resolve) => {
      release = resolve;
    });
    const email = {
      send: vi.fn().mockImplementation(async ({ to }: { to: string }) => {
        if (to === 'student-0@example.com') throw new PermanentEmailError('invalid recipient');
        if (to === 'student-1@example.com') await inFlight;
        return 'sent' as const;
      }),
    };
    const service = new SessionNotifications(
      {} as PrismaService,
      {} as SessionNotificationTargetService,
      email,
    );
    const batch = recipientsBatch(7);
    const delivery = service.deliverEmails(batch);
    const assertion = expect(delivery).rejects.toBeInstanceOf(UnrecoverableError);
    await Promise.resolve();
    expect(email.send).toHaveBeenCalledTimes(5);
    release();
    await assertion;
    expect(email.send).toHaveBeenCalledTimes(7);
  });

  it('keeps the job retryable when permanent and transient recipient failures coexist', async () => {
    const email = {
      send: vi.fn().mockImplementation(({ to }: { to: string }) => {
        if (to === 'student-0@example.com')
          return Promise.reject(new PermanentEmailError('invalid'));
        if (to === 'student-1@example.com')
          return Promise.reject(new RetryableEmailError('network'));
        return Promise.resolve('sent' as const);
      }),
    };
    const service = new SessionNotifications(
      {} as PrismaService,
      {} as SessionNotificationTargetService,
      email,
    );
    await expect(service.deliverEmails(recipientsBatch(7))).rejects.toBeInstanceOf(
      RetryableEmailError,
    );
    expect(email.send).toHaveBeenCalledTimes(7);
  });
});

function recipientsBatch(count: number): SessionNotificationBatch {
  const batch = batchFixture();
  batch.recipients = Array.from({ length: count }, (_, index) => ({
    userId: `user-${index}`,
    personId: `person-${index}`,
    locale: 'en' as const,
    email: `student-${index}@example.com`,
  }));
  return batch;
}

function envelopeFixture(): InternalEventEnvelope {
  return {
    v: 1,
    eventId: 'event-a',
    type: 'session.rescheduled',
    organizationId: 'org-a',
    aggregate: { type: 'Session', id: 'session-a' },
    occurredAt: '2026-08-11T10:00:00.000Z',
    payload: {},
  };
}

function batchFixture(): SessionNotificationBatch {
  return {
    eventId: 'event-a',
    organizationId: 'org-a',
    studentPersonIds: ['person-a'],
    recipients: [],
    payload: {
      v: 1,
      sessionId: 'session-a',
      type: 'RESCHEDULED',
      startsAt: null,
      endsAt: null,
      cohort: { id: 'cohort-a', code: 'C01', name: null },
      room: null,
    },
    eventKeyByUser: new Map(),
  };
}
