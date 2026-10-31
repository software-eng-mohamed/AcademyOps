import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../platform/database/prisma.service';
import type { InternalEventEnvelope } from '../../realtime/realtime.contracts';
import type {
  OtpChannelAlertBatch,
  OtpChannelAlertPayload,
  OtpChannelAlertRecipient,
  OtpChannelAlertType,
} from './otp-channel-notification.types';

@Injectable()
export class OtpChannelNotificationTargetService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(event: InternalEventEnvelope): Promise<OtpChannelAlertBatch | null> {
    const type = this.alertType(event.type);
    if (!type || event.aggregate.type !== 'WhatsappOtpChannel') return null;
    const payload = this.payload(event, type);
    if (!payload) return null;
    const now = new Date();
    const grants = await this.prisma.rolePermissionGrant.findMany({
      where: {
        organizationId: event.organizationId,
        permissionCode: 'messaging.otp.read',
        scope: 'O',
      },
      select: { roleId: true },
    });
    if (!grants.length)
      return {
        eventId: event.eventId,
        organizationId: event.organizationId,
        payload,
        recipients: [],
      };
    const assignments = await this.prisma.userRoleAssignment.findMany({
      where: {
        organizationId: event.organizationId,
        roleId: { in: grants.map(({ roleId }) => roleId) },
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      select: { userId: true },
      distinct: ['userId'],
    });
    const recipients = await this.recipients(
      event.organizationId,
      assignments.map(({ userId }) => userId),
    );
    return { eventId: event.eventId, organizationId: event.organizationId, payload, recipients };
  }

  private async recipients(
    organizationId: string,
    userIds: string[],
  ): Promise<OtpChannelAlertRecipient[]> {
    if (!userIds.length) return [];
    const users = await this.prisma.user.findMany({
      where: { organizationId, id: { in: userIds }, status: 'ACTIVE' },
      select: { id: true, personId: true, preferredLocale: true },
    });
    if (!users.length) return [];
    const [contacts, identifiers] = await Promise.all([
      this.prisma.personContact.findMany({
        where: {
          organizationId,
          personId: { in: users.map(({ personId }) => personId) },
          type: 'EMAIL',
          isPrimary: true,
          verifiedAt: { not: null },
        },
        select: { personId: true, rawValue: true, normalizedValue: true },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.userLoginIdentifier.findMany({
        where: {
          organizationId,
          userId: { in: users.map(({ id }) => id) },
          type: 'EMAIL',
          verifiedAt: { not: null },
          revokedAt: null,
        },
        select: { userId: true, normalizedValue: true },
      }),
    ]);
    const contactByPerson = new Map<string, { value: string; normalized: string }>();
    for (const contact of contacts) {
      if (contactByPerson.has(contact.personId)) continue;
      const value = contact.normalizedValue ?? contact.rawValue;
      contactByPerson.set(contact.personId, { value, normalized: value.trim().toLowerCase() });
    }
    const verifiedByUser = new Map<string, Set<string>>();
    for (const identifier of identifiers) {
      const values = verifiedByUser.get(identifier.userId) ?? new Set<string>();
      values.add(identifier.normalizedValue.trim().toLowerCase());
      verifiedByUser.set(identifier.userId, values);
    }
    return users.map((user) => {
      const contact = contactByPerson.get(user.personId);
      return {
        userId: user.id,
        personId: user.personId,
        locale: user.preferredLocale === 'ar' ? 'ar' : 'en',
        email:
          contact && verifiedByUser.get(user.id)?.has(contact.normalized) ? contact.value : null,
      };
    });
  }

  private payload(
    event: InternalEventEnvelope,
    type: OtpChannelAlertType,
  ): OtpChannelAlertPayload | null {
    if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload))
      return null;
    const value = event.payload as Record<string, unknown>;
    const channelId = value.channelId;
    const state = value.state;
    const errorCode = value.errorCode;
    if (
      channelId !== event.aggregate.id ||
      typeof state !== 'string' ||
      !/^[A-Z_]{2,30}$/.test(state) ||
      (errorCode !== undefined &&
        errorCode !== null &&
        (typeof errorCode !== 'string' || !/^[A-Z0-9_]{2,80}$/.test(errorCode)))
    ) {
      return null;
    }
    return {
      v: 1,
      channelId,
      type,
      state,
      errorCode: typeof errorCode === 'string' ? errorCode : null,
    };
  }

  private alertType(type: string): OtpChannelAlertType | null {
    if (type === 'messaging.otp_channel.qr_required') return 'QR_REQUIRED';
    if (type === 'messaging.otp_channel.unavailable') return 'UNAVAILABLE';
    if (type === 'messaging.otp_channel.recovered') return 'RECOVERED';
    return null;
  }
}
