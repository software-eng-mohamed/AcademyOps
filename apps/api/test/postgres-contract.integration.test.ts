import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { IdempotencyService } from '../src/platform/idempotency/idempotency.service';
import { createTestHarness } from './postgres/harness';
const { prisma, inRollbackTransaction, expectDatabaseRejection, databaseDescribe } =
  createTestHarness();
databaseDescribe('PostgreSQL contract - IAM & Idempotency', () => {
  afterAll(async () => prisma.$disconnect());
  it('protects IAM states, active assignments, and the last active Owner', async () => {
    await inRollbackTransaction(async (transaction) => {
      const organization = await transaction.organization.create({
        data: { code: `IAM-${randomUUID()}`, name: 'Test' },
      });
      const ownerRole = await transaction.role.create({
        data: {
          organizationId: organization.id,
          code: 'OWNER',
          name: 'Owner',
          isSystem: true,
        },
      });
      const person = await transaction.person.create({
        data: {
          organizationId: organization.id,
          publicId: `OWNER-${randomUUID().slice(0, 20)}`,
          name: 'Owner',
        },
      });
      const user = await transaction.user.create({
        data: { organizationId: organization.id, personId: person.id, status: 'ACTIVE' },
      });
      await transaction.userRoleAssignment.create({
        data: { organizationId: organization.id, userId: user.id, roleId: ownerRole.id },
      });
      await expectDatabaseRejection(transaction, () =>
        transaction.userRoleAssignment.create({
          data: { organizationId: organization.id, userId: user.id, roleId: ownerRole.id },
        }),
      );
      await expectDatabaseRejection(transaction, () =>
        transaction.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } }),
      );
      await expectDatabaseRejection(transaction, () =>
        transaction.rolePermissionGrant.create({
          data: {
            organizationId: organization.id,
            roleId: ownerRole.id,
            permissionCode: 'users.manage',
            scope: 'X',
          },
        }),
      );
      await expectDatabaseRejection(transaction, () =>
        transaction.branch.create({
          data: {
            organizationId: organization.id,
            code: 'INVALID-VERSION',
            name: 'Branch',
            version: 0,
          },
        }),
      );
    });
  });
  it('replays an identical idempotency request and rejects a changed payload', async () => {
    await inRollbackTransaction(async (transaction) => {
      const organization = await transaction.organization.create({
        data: { code: `IDEM-${randomUUID()}`, name: 'Test' },
      });
      const service = new IdempotencyService();
      const first = await service.begin<{
        ok: boolean;
      }>(transaction, organization.id, 'test.operation', 'same-key', {
        amount: '10.00',
        reference: 'A',
      });
      expect(first.replayed).toBe(false);
      await service.complete(transaction, first.recordId, 200, { ok: true });
      const replay = await service.begin<{
        ok: boolean;
      }>(transaction, organization.id, 'test.operation', 'same-key', {
        reference: 'A',
        amount: '10.00',
      });
      expect(replay).toMatchObject({ replayed: true, response: { ok: true } });
      await expect(
        service.begin(transaction, organization.id, 'test.operation', 'same-key', {
          amount: '11.00',
          reference: 'A',
        }),
      ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_KEY_REUSED' } });
    });
  });
});
