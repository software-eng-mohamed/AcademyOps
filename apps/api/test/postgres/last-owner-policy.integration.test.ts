import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { assertOwnerContinuity } from '../../src/iam/administration/last-owner-policy';
import { createTestHarness } from './harness';
const { prisma, inRollbackTransaction, databaseDescribe } = createTestHarness();
databaseDescribe('last active Owner PostgreSQL policy', () => {
  afterAll(async () => prisma.$disconnect());
  it('blocks the sole active Owner and allows removal after a second Owner is active', () =>
    inRollbackTransaction(async (transaction) => {
      const organization = await transaction.organization.create({
        data: {
          code: `OWN-${randomUUID().slice(0, 8)}`,
          name: 'Owner policy',
        },
      });
      const role = await transaction.role.create({
        data: {
          organizationId: organization.id,
          code: 'OWNER',
          name: 'Owner',
          isSystem: true,
        },
      });
      const users: Array<{
        id: string;
      }> = [];
      for (const suffix of ['A', 'B']) {
        const person = await transaction.person.create({
          data: {
            organizationId: organization.id,
            publicId: `OWNER-${suffix}-${randomUUID().slice(0, 8)}`,
            name: `Owner ${suffix}`,
          },
        });
        users.push(
          await transaction.user.create({
            data: { organizationId: organization.id, personId: person.id, status: 'ACTIVE' },
          }),
        );
      }
      await transaction.userRoleAssignment.create({
        data: {
          organizationId: organization.id,
          userId: users[0]!.id,
          roleId: role.id,
          startsAt: new Date(Date.now() - 1000),
        },
      });
      await expect(
        assertOwnerContinuity(transaction, organization.id, users[0]!.id),
      ).rejects.toMatchObject({ response: { code: 'LAST_ACTIVE_OWNER_REQUIRED' } });
      await transaction.userRoleAssignment.create({
        data: {
          organizationId: organization.id,
          userId: users[1]!.id,
          roleId: role.id,
          startsAt: new Date(Date.now() - 1000),
        },
      });
      await expect(
        assertOwnerContinuity(transaction, organization.id, users[0]!.id),
      ).resolves.toBeUndefined();
    }));
});
