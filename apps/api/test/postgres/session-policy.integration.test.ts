import { randomUUID } from 'node:crypto';
import { afterAll, it } from 'vitest';
import { createTestHarness } from './harness';
const { prisma, inRollbackTransaction, expectDatabaseRejection, databaseDescribe } =
  createTestHarness();
databaseDescribe('session policy persistence', () => {
  afterAll(async () => prisma.$disconnect());
  it('accepts the trusted student limit and rejects an excessive idle lifetime', () =>
    inRollbackTransaction(async (transaction) => {
      const organization = await transaction.organization.create({
        data: {
          code: `SESSION-${randomUUID().slice(0, 8)}`,
          name: 'Session',
        },
      });
      const person = await transaction.person.create({
        data: {
          organizationId: organization.id,
          publicId: `PER-${randomUUID().slice(0, 16)}`,
          name: 'Session user',
        },
      });
      const user = await transaction.user.create({
        data: { organizationId: organization.id, personId: person.id, status: 'ACTIVE' },
      });
      const base = {
        organizationId: organization.id,
        userId: user.id,
        csrfSecretHash: randomUUID(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      };
      await transaction.userSession.create({
        data: { ...base, tokenHash: randomUUID(), idleTimeoutSeconds: 604800 },
      });
      await expectDatabaseRejection(transaction, () =>
        transaction.userSession.create({
          data: { ...base, tokenHash: randomUUID(), idleTimeoutSeconds: 604801 },
        }),
      );
    }));
});
