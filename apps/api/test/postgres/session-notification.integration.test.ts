import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { afterAll, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../src/platform/database/prisma.service';
import type { InternalEventEnvelope } from '../../src/realtime/realtime.contracts';
import { SessionNotificationService } from '../../src/worker/notifications/session-notification.service';
import { SessionNotificationTargetService } from '../../src/worker/notifications/session-notification-target.service';
import { setupTestContext } from './attendance-test.helper';
import { createTestHarness } from './harness';

const { prisma, inRollbackTransaction, databaseDescribe } = createTestHarness();

databaseDescribe('session notification persistence (PostgreSQL)', () => {
  afterAll(async () => prisma.$disconnect());

  it('targets the tenant and active roster, strictly verifies email, and stays idempotent', () =>
    inRollbackTransaction(async (transaction) => {
      const context = await setupTestContext(transaction);
      const userTwo = await transaction.user.create({
        data: {
          organizationId: context.org.id,
          personId: context.p2.id,
          status: 'ACTIVE',
          preferredLocale: 'ar',
        },
      });
      await addEmailIdentity(transaction, {
        organizationId: context.org.id,
        personId: context.p1.id,
        userId: context.uStaff.id,
        email: 'one@example.com',
      });
      await addEmailIdentity(transaction, {
        organizationId: context.org.id,
        personId: context.p2.id,
        userId: userTwo.id,
        email: 'two@example.com',
        loginValue: 'different@example.com',
      });
      await transaction.userLoginIdentifier.create({
        data: {
          organizationId: context.org.id,
          userId: userTwo.id,
          type: 'EMAIL',
          normalizedValue: 'two@example.com',
          verifiedAt: new Date(),
          revokedAt: new Date(),
        },
      });
      const adapter = notificationAdapter(transaction);
      const target = new SessionNotificationTargetService(adapter);
      const service = new SessionNotificationService(adapter, target, {
        send: vi.fn(),
      });
      const event = sessionEvent(context.org.id, context.session, context.cohort.id);

      const first = await service.persist(event);
      const second = await service.persist(event);
      expect(first?.studentPersonIds).toEqual(
        expect.arrayContaining([context.p1.id, context.p2.id]),
      );
      expect(first?.recipients).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ userId: context.uStaff.id, email: 'one@example.com' }),
          expect.objectContaining({ userId: userTwo.id, email: null, locale: 'ar' }),
        ]),
      );
      expect(second?.eventKeyByUser.size).toBe(2);
      expect(
        await transaction.userNotification.count({
          where: {
            organizationId: context.org.id,
            eventKey: { startsWith: `session:${event.eventId}` },
          },
        }),
      ).toBe(2);

      const foreignEvent = { ...event, eventId: randomUUID(), organizationId: randomUUID() };
      await expect(service.persist(foreignEvent)).resolves.toBeNull();
      expect(
        await transaction.userNotification.count({
          where: {
            organizationId: context.org.id,
            eventKey: { startsWith: `session:${event.eventId}` },
          },
        }),
      ).toBe(2);

      await transaction.enrollmentCohortAssignment.updateMany({
        where: { organizationId: context.org.id, enrollmentId: context.e2.id },
        data: { endsAt: context.session.startsAt },
      });
      const afterEnd = await service.persist({ ...event, eventId: randomUUID() });
      expect(afterEnd?.studentPersonIds).toEqual([context.p1.id]);
      expect(afterEnd?.recipients.map(({ userId }) => userId)).toEqual([context.uStaff.id]);
    }));
});

type EmailIdentity = {
  organizationId: string;
  personId: string;
  userId: string;
  email: string;
  loginValue?: string;
};

async function addEmailIdentity(transaction: Prisma.TransactionClient, input: EmailIdentity) {
  await transaction.personContact.create({
    data: {
      organizationId: input.organizationId,
      personId: input.personId,
      type: 'EMAIL',
      rawValue: input.email,
      normalizedValue: input.email,
      isPrimary: true,
      verifiedAt: new Date(),
    },
  });
  await transaction.userLoginIdentifier.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      type: 'EMAIL',
      normalizedValue: input.loginValue ?? input.email,
      verifiedAt: new Date(),
    },
  });
}

function notificationAdapter(transaction: Prisma.TransactionClient): PrismaService {
  return {
    session: transaction.session,
    cohort: transaction.cohort,
    room: transaction.room,
    enrollmentCohortAssignment: transaction.enrollmentCohortAssignment,
    enrollment: transaction.enrollment,
    user: transaction.user,
    personContact: transaction.personContact,
    userLoginIdentifier: transaction.userLoginIdentifier,
    userNotification: transaction.userNotification,
    serializable: async <T>(work: (client: Prisma.TransactionClient) => Promise<T>) =>
      work(transaction),
  } as unknown as PrismaService;
}

function sessionEvent(
  organizationId: string,
  session: { id: string; startsAt: Date | null; endsAt: Date | null },
  cohortId: string,
): InternalEventEnvelope {
  return {
    v: 1,
    eventId: randomUUID(),
    type: 'session.rescheduled',
    organizationId,
    aggregate: { type: 'Session', id: session.id },
    occurredAt: new Date().toISOString(),
    payload: {
      sessionId: session.id,
      cohortId,
      startsAt: session.startsAt?.toISOString(),
      endsAt: session.endsAt?.toISOString(),
      roomId: null,
    },
  };
}
