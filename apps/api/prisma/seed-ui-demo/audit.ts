import { randomUUID } from 'node:crypto';
import type { Organization, User } from '@prisma/client';
import type { SeedUiDemoContext } from './types';

export async function seedAuditEvents(
  ctx: SeedUiDemoContext,
  input: { organization: Organization; demoUser: User },
): Promise<void> {
  const { prisma } = ctx;
  const { organization, demoUser } = input;

  const fixtureAudit = await prisma.auditEvent.findFirst({
    where: { organizationId: organization.id, correlationId: 'ui-fixture-dashboard' },
  });
  if (!fixtureAudit) {
    await prisma.auditEvent.createMany({
      data: [
        {
          organizationId: organization.id,
          actorUserId: demoUser.id,
          action: 'dashboard.fixture.ready',
          entityType: 'Organization',
          entityId: organization.id,
          correlationId: 'ui-fixture-dashboard',
        },
        {
          organizationId: organization.id,
          actorUserId: demoUser.id,
          action: 'payment.posted',
          entityType: 'Payment',
          entityId: randomUUID(),
          correlationId: 'ui-fixture-payment',
        },
        {
          organizationId: organization.id,
          actorUserId: demoUser.id,
          action: 'attendance.recorded',
          entityType: 'Session',
          entityId: randomUUID(),
          correlationId: 'ui-fixture-attendance',
        },
      ],
    });
  }
}
