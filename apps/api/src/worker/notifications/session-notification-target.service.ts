import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../platform/database/prisma.service';
import type { InternalEventEnvelope } from '../../realtime/realtime.contracts';
import type {
  SessionNotificationContext,
  SessionNotificationEventType,
} from './session-notification.types';
type SessionSnapshot = {
  startsAt: Date | null | undefined;
  endsAt: Date | null | undefined;
  roomId: string | null | undefined;
};
@Injectable()
export class SessionNotificationTargetService {
  constructor(private readonly prisma: PrismaService) {}
  async resolve(event: InternalEventEnvelope): Promise<SessionNotificationContext | null> {
    if (!this.isSupported(event.type)) return null;
    const session = await this.prisma.session.findFirst({
      where: { organizationId: event.organizationId, id: event.aggregate.id },
      select: { id: true, cohortId: true, roomId: true, startsAt: true, endsAt: true },
    });
    if (!session) return null;
    const snapshot = this.snapshot(event.payload, session.id, session.cohortId);
    const startsAt = snapshot?.startsAt ?? session.startsAt;
    const endsAt = snapshot?.endsAt ?? session.endsAt;
    const sessionAt = startsAt ?? endsAt;
    if (!sessionAt) return null;
    const cohort = await this.prisma.cohort.findFirst({
      where: { organizationId: event.organizationId, id: session.cohortId },
      select: { id: true, code: true, name: true },
    });
    if (!cohort) return null;
    const roomId = snapshot?.roomId === undefined ? session.roomId : snapshot.roomId;
    const room = roomId
      ? await this.prisma.room.findFirst({
          where: { organizationId: event.organizationId, id: roomId },
          select: { id: true, code: true, name: true },
        })
      : null;
    const studentPersonIds = await this.studentPersonIds(
      event.organizationId,
      session.cohortId,
      sessionAt,
    );
    const recipients = await this.recipients(event.organizationId, studentPersonIds);
    return {
      eventId: event.eventId,
      organizationId: event.organizationId,
      payload: {
        v: 1,
        sessionId: session.id,
        type: event.type === 'session.rescheduled' ? 'RESCHEDULED' : 'CANCELLED',
        startsAt: startsAt?.toISOString() ?? null,
        endsAt: endsAt?.toISOString() ?? null,
        cohort,
        room,
      },
      recipients,
      studentPersonIds,
    };
  }
  private async studentPersonIds(organizationId: string, cohortId: string, sessionAt: Date) {
    const assignments = await this.prisma.enrollmentCohortAssignment.findMany({
      where: {
        organizationId,
        cohortId,
        startsAt: { lte: sessionAt },
        OR: [{ endsAt: null }, { endsAt: { gt: sessionAt } }],
      },
      select: { enrollmentId: true },
      distinct: ['enrollmentId'],
    });
    if (!assignments.length) return [];
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        organizationId,
        id: { in: assignments.map(({ enrollmentId }) => enrollmentId) },
      },
      select: { studentPersonId: true },
    });
    return [...new Set(enrollments.map(({ studentPersonId }) => studentPersonId))];
  }
  private async recipients(organizationId: string, personIds: string[]) {
    if (!personIds.length) return [];
    const users = await this.prisma.user.findMany({
      where: { organizationId, personId: { in: personIds }, status: 'ACTIVE' },
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
    const contactByPerson = new Map<
      string,
      {
        value: string;
        normalized: string;
      }
    >();
    for (const contact of contacts) {
      if (contactByPerson.has(contact.personId)) continue;
      contactByPerson.set(contact.personId, {
        value: contact.normalizedValue ?? contact.rawValue,
        normalized: (contact.normalizedValue ?? contact.rawValue).trim().toLowerCase(),
      });
    }
    const verifiedByUser = new Map<string, Set<string>>();
    for (const identifier of identifiers) {
      const values = verifiedByUser.get(identifier.userId) ?? new Set<string>();
      values.add(identifier.normalizedValue.trim().toLowerCase());
      verifiedByUser.set(identifier.userId, values);
    }
    return users.map((user) => {
      const contact = contactByPerson.get(user.personId);
      const verified = contact ? verifiedByUser.get(user.id)?.has(contact.normalized) : false;
      return {
        userId: user.id,
        personId: user.personId,
        locale: user.preferredLocale === 'ar' ? ('ar' as const) : ('en' as const),
        email: contact && verified ? contact.value : null,
      };
    });
  }
  private snapshot(payload: unknown, sessionId: string, cohortId: string): SessionSnapshot | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    const value = payload as Record<string, unknown>;
    if (value.sessionId !== sessionId || value.cohortId !== cohortId) return null;
    return {
      startsAt: this.optionalDate(value.startsAt),
      endsAt: this.optionalDate(value.endsAt),
      roomId: typeof value.roomId === 'string' || value.roomId === null ? value.roomId : undefined,
    };
  }
  private optionalDate(value: unknown): Date | null | undefined {
    if (value === null) return null;
    if (typeof value !== 'string') return undefined;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? new Date(timestamp) : undefined;
  }
  private isSupported(type: string): type is SessionNotificationEventType {
    return type === 'session.rescheduled' || type === 'session.cancelled';
  }
}
