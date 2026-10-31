import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import type { InternalEventEnvelope } from '../src/realtime/realtime.contracts';
import { OtpChannelNotificationService } from '../src/worker/notifications/otp-channel-notification.service';
import { OtpChannelNotificationTargetService } from '../src/worker/notifications/otp-channel-notification-target.service';

describe('OTP channel notifications', () => {
  it('targets active organization-scope operators with a strictly verified email', async () => {
    const prisma = targetPrisma();
    const service = new OtpChannelNotificationTargetService(prisma as never);
    const batch = await service.resolve(event());

    const permissionQuery = prisma.rolePermissionGrant.findMany.mock.calls[0]?.[0] as {
      where: { permissionCode: string; scope: string };
    };
    expect(permissionQuery.where).toEqual(
      expect.objectContaining({ permissionCode: 'messaging.otp.read', scope: 'O' }),
    );
    expect(batch?.recipients).toEqual([
      expect.objectContaining({ userId: 'user-a', email: 'operator@example.com', locale: 'ar' }),
    ]);
    expect(batch?.payload).toEqual({
      v: 1,
      channelId: 'channel-a',
      type: 'UNAVAILABLE',
      state: 'FAULTED',
      errorCode: 'AUTH_STORE_FAILED',
    });
  });

  it('rejects malformed internal payloads before resolving recipients', async () => {
    const prisma = targetPrisma();
    const service = new OtpChannelNotificationTargetService(prisma as never);
    const malformed = event();
    malformed.payload = {
      channelId: 'channel-a',
      state: 'FAULTED',
      errorCode: '+201234567890 secret',
    };
    expect(await service.resolve(malformed)).toBeNull();
    expect(prisma.rolePermissionGrant.findMany).not.toHaveBeenCalled();
  });

  it('persists a site alert before sending an idempotent dashboard email', async () => {
    const batch = {
      eventId: 'event-a',
      organizationId: 'org-a',
      payload: {
        v: 1 as const,
        channelId: 'channel-a',
        type: 'QR_REQUIRED' as const,
        state: 'QR_REQUIRED',
        errorCode: null,
      },
      recipients: [
        {
          userId: 'user-a',
          personId: 'person-a',
          locale: 'ar' as const,
          email: 'operator@example.com',
        },
      ],
    };
    const upsert = vi.fn().mockResolvedValue({});
    const prisma = {
      serializable: vi.fn((work: (tx: unknown) => unknown) =>
        work({ userNotification: { upsert } }),
      ),
    };
    const targets = { resolve: vi.fn().mockResolvedValue(batch) };
    const email = { send: vi.fn().mockResolvedValue('sent') };
    const ledger = {
      once: vi.fn((_key: string, operation: () => Promise<unknown>) => operation()),
    };
    const service = new OtpChannelNotificationService(
      prisma as never,
      targets as never,
      ledger as never,
      email,
      new ConfigService({ WEB_ORIGIN: 'https://academy.example.com' }),
    );

    const persisted = await service.persist(event());
    const notificationInput = upsert.mock.calls[0]?.[0] as {
      create: { type: string; eventKey: string };
    };
    expect(notificationInput.create).toEqual(
      expect.objectContaining({
        type: 'OTP_CHANNEL_QR_REQUIRED',
        eventKey: 'otp-channel:event-a:user-a',
      }),
    );
    await service.deliverEmails(persisted!);
    expect(ledger.once).toHaveBeenCalledWith('otp-channel:event-a:user-a', expect.any(Function));
    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'operator@example.com',
        idempotencyKey: 'plg-otp-channel-event-a-user-a',
      }),
    );
    expect((email.send.mock.calls[0]?.[0] as { text: string }).text).toContain(
      'https://academy.example.com/en/whatsapp',
    );
    expect((email.send.mock.calls[0]?.[0] as { text: string }).text).toContain(
      'needs a QR scan from the dashboard',
    );
  });
});

function event(): InternalEventEnvelope {
  return {
    v: 1,
    eventId: 'event-a',
    type: 'messaging.otp_channel.unavailable',
    organizationId: 'org-a',
    aggregate: { type: 'WhatsappOtpChannel', id: 'channel-a' },
    occurredAt: '2026-08-15T00:00:00.000Z',
    payload: { channelId: 'channel-a', state: 'FAULTED', errorCode: 'AUTH_STORE_FAILED' },
  };
}

function targetPrisma() {
  return {
    rolePermissionGrant: { findMany: vi.fn().mockResolvedValue([{ roleId: 'role-a' }]) },
    userRoleAssignment: { findMany: vi.fn().mockResolvedValue([{ userId: 'user-a' }]) },
    user: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: 'user-a', personId: 'person-a', preferredLocale: 'ar' }]),
    },
    personContact: {
      findMany: vi.fn().mockResolvedValue([
        {
          personId: 'person-a',
          rawValue: 'operator@example.com',
          normalizedValue: 'operator@example.com',
        },
      ]),
    },
    userLoginIdentifier: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ userId: 'user-a', normalizedValue: 'operator@example.com' }]),
    },
  };
}
