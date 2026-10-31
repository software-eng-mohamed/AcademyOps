import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { createTestHarness } from './harness';
const { prisma, inRollbackTransaction, expectDatabaseRejection, databaseDescribe } =
  createTestHarness();
databaseDescribe('PostgreSQL Owner-only finance permissions trigger', () => {
  afterAll(async () => prisma.$disconnect());
  it('allows Owner grants, rejects non-Owner/custom grants, and leaves unrelated grants allowed', async () => {
    await inRollbackTransaction(async (transaction) => {
      // Seed permissions in the transaction first, to ensure foreign keys are satisfied
      const allPermissions = [
        'payments.reverse.request',
        'payments.reverse.approve',
        'refunds.request',
        'refunds.approve',
        'payments.verify',
        'students.read_basic',
        'students.create',
      ];
      await transaction.permission.createMany({
        data: allPermissions.map((code) => ({ code, description: code })),
        skipDuplicates: true,
      });
      // Create organization
      const org = await transaction.organization.create({
        data: { code: `ORG-${randomUUID().slice(0, 10)}`, name: 'Org' },
      });
      // Create OWNER role
      const ownerRole = await transaction.role.create({
        data: {
          organizationId: org.id,
          code: 'OWNER',
          name: 'Owner',
          isSystem: true,
        },
      });
      // Create OPERATIONS role
      const operationsRole = await transaction.role.create({
        data: {
          organizationId: org.id,
          code: 'OPERATIONS',
          name: 'Operations',
          isSystem: true,
        },
      });
      // Create custom role
      const customRole = await transaction.role.create({
        data: {
          organizationId: org.id,
          code: 'CUSTOM_ROLE',
          name: 'Custom Role',
          isSystem: false,
        },
      });
      const ownerOnlyPermissions = [
        'payments.reverse.request',
        'payments.reverse.approve',
        'refunds.request',
        'refunds.approve',
        'payments.verify',
      ];
      // 1. Prove trigger ALLOWS Owner grants
      for (const permissionCode of ownerOnlyPermissions) {
        const grant = await transaction.rolePermissionGrant.create({
          data: {
            organizationId: org.id,
            roleId: ownerRole.id,
            permissionCode,
            scope: 'O',
          },
        });
        expect(grant.id).toBeDefined();
        // Also check that updates on valid OWNER grants are allowed
        const updatedGrant = await transaction.rolePermissionGrant.update({
          where: { id: grant.id },
          data: { scope: 'B' },
        });
        expect(updatedGrant.scope).toBe('B');
      }
      // 2. Prove trigger REJECTS non-Owner grants (on system roles like OPERATIONS, or custom roles)
      for (const permissionCode of ownerOnlyPermissions) {
        // Should reject insert on OPERATIONS role
        await expectDatabaseRejection(transaction, () =>
          transaction.rolePermissionGrant.create({
            data: {
              organizationId: org.id,
              roleId: operationsRole.id,
              permissionCode,
              scope: 'B',
            },
          }),
        );
        // Should reject insert on Custom role
        await expectDatabaseRejection(transaction, () =>
          transaction.rolePermissionGrant.create({
            data: {
              organizationId: org.id,
              roleId: customRole.id,
              permissionCode,
              scope: 'B',
            },
          }),
        );
      }
      // 3. Prove trigger ALLOWS unrelated grants on non-Owner/custom roles
      const unrelatedPermission = 'students.read_basic';
      const opUnrelatedGrant = await transaction.rolePermissionGrant.create({
        data: {
          organizationId: org.id,
          roleId: operationsRole.id,
          permissionCode: unrelatedPermission,
          scope: 'B',
        },
      });
      expect(opUnrelatedGrant.id).toBeDefined();
      const customUnrelatedGrant = await transaction.rolePermissionGrant.create({
        data: {
          organizationId: org.id,
          roleId: customRole.id,
          permissionCode: unrelatedPermission,
          scope: 'B',
        },
      });
      expect(customUnrelatedGrant.id).toBeDefined();
      // Also prove that updating unrelated grants on custom roles works
      const updatedCustomGrant = await transaction.rolePermissionGrant.update({
        where: { id: customUnrelatedGrant.id },
        data: { scope: 'O' },
      });
      expect(updatedCustomGrant.scope).toBe('O');
      // 4. Prove trigger rejects updating a grant's permissionCode to an owner-only permission on non-Owner role
      // Create a valid grant on custom role first
      const grantToUpdate = await transaction.rolePermissionGrant.create({
        data: {
          organizationId: org.id,
          roleId: customRole.id,
          permissionCode: 'students.create',
          scope: 'B',
        },
      });
      // Try updating its permission code to a protected one, which should be rejected
      await expectDatabaseRejection(transaction, () =>
        transaction.rolePermissionGrant.update({
          where: { id: grantToUpdate.id },
          data: { permissionCode: 'refunds.approve' },
        }),
      );
    });
  });
});
