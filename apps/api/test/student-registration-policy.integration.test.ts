import { expect, it } from 'vitest';
import { createTestHarness } from './postgres/harness';
const harness = createTestHarness();
harness.databaseDescribe('Student Registration - Database Triggers and CHECK Constraints', () => {
  it('enforces non-Owner/custom permission trigger rejection and allows unrelated grants', () =>
    harness.inRollbackTransaction(async (transaction) => {
      await transaction.permission.createMany({
        data: [
          { code: 'students.registration.manage', description: 'Manage student registrations' },
          { code: 'students.read_basic', description: 'Read basic student info' },
        ],
        skipDuplicates: true,
      });
      const org = await transaction.organization.create({
        data: { code: 'INTEG_TRIG', name: 'Trigger Org' },
      });
      const salesRole = await transaction.role.create({
        data: {
          organizationId: org.id,
          code: 'SALES',
          name: 'Sales',
        },
      });
      // 1. Rejects custom non-Owner role grant for students.registration.manage
      await harness.expectDatabaseRejection(transaction, async () => {
        await transaction.$executeRaw`
          INSERT INTO role_permission_grants (id, organization_id, role_id, permission_code, scope, created_at)
          VALUES (gen_random_uuid(), ${org.id}::uuid, ${salesRole.id}::uuid, 'students.registration.manage', 'O', NOW())
        `;
      });
      // 2. Allows unrelated normal grants (e.g. students.read_basic) on non-Owner roles
      const grantId = await transaction.$executeRaw`
        INSERT INTO role_permission_grants (id, organization_id, role_id, permission_code, scope, created_at)
        VALUES (gen_random_uuid(), ${org.id}::uuid, ${salesRole.id}::uuid, 'students.read_basic', 'B', NOW())
      `;
      expect(grantId).toBe(1);
    }));
  it('enforces status, version, and coherent review check constraints on student_registrations table', () =>
    harness.inRollbackTransaction(async (transaction) => {
      const org = await transaction.organization.create({
        data: { code: 'INTEG_CHK', name: 'Check Org' },
      });
      const person = await transaction.person.create({
        data: { organizationId: org.id, publicId: 'TEST-CK-1', name: 'Ahmed' },
      });
      const user = await transaction.user.create({
        data: {
          organizationId: org.id,
          personId: person.id,
          status: 'PENDING',
          passwordHash: 'hash',
          mustChangePassword: false,
        },
      });
      // 1. Reject invalid status
      await harness.expectDatabaseRejection(transaction, async () => {
        await transaction.$executeRaw`
          INSERT INTO student_registrations (id, organization_id, person_id, user_id, status, version)
          VALUES (gen_random_uuid(), ${org.id}::uuid, ${person.id}::uuid, ${user.id}::uuid, 'INVALID_STATUS', 1)
        `;
      });
      // 2. Reject version <= 0
      await harness.expectDatabaseRejection(transaction, async () => {
        await transaction.$executeRaw`
          INSERT INTO student_registrations (id, organization_id, person_id, user_id, status, version)
          VALUES (gen_random_uuid(), ${org.id}::uuid, ${person.id}::uuid, ${user.id}::uuid, 'PENDING', 0)
        `;
      });
      // 3. Reject PENDING status with review timestamps/fields populated
      await harness.expectDatabaseRejection(transaction, async () => {
        await transaction.$executeRaw`
          INSERT INTO student_registrations (id, organization_id, person_id, user_id, status, reviewed_at, reviewed_by_user_id)
          VALUES (gen_random_uuid(), ${org.id}::uuid, ${person.id}::uuid, ${user.id}::uuid, 'PENDING', NOW(), ${user.id}::uuid)
        `;
      });
      // 4. Reject APPROVED status without reviewer fields or with rejection reason
      await harness.expectDatabaseRejection(transaction, async () => {
        await transaction.$executeRaw`
          INSERT INTO student_registrations (id, organization_id, person_id, user_id, status)
          VALUES (gen_random_uuid(), ${org.id}::uuid, ${person.id}::uuid, ${user.id}::uuid, 'APPROVED')
        `;
      });
      // 5. Reject REJECTED status with too short reason (length < 5)
      await harness.expectDatabaseRejection(transaction, async () => {
        await transaction.$executeRaw`
          INSERT INTO student_registrations (id, organization_id, person_id, user_id, status, reviewed_at, reviewed_by_user_id, rejection_reason)
          VALUES (gen_random_uuid(), ${org.id}::uuid, ${person.id}::uuid, ${user.id}::uuid, 'REJECTED', NOW(), ${user.id}::uuid, 'abc')
        `;
      });
    }));
  it('enforces legal registration status-transition trigger PENDING -> APPROVED/REJECTED', () =>
    harness.inRollbackTransaction(async (transaction) => {
      const org = await transaction.organization.create({
        data: { code: 'INTEG_TRANS', name: 'Transition Org' },
      });
      const person = await transaction.person.create({
        data: { organizationId: org.id, publicId: 'TEST-TR-1', name: 'Khaled' },
      });
      const user = await transaction.user.create({
        data: {
          organizationId: org.id,
          personId: person.id,
          status: 'PENDING',
          passwordHash: 'hash',
          mustChangePassword: false,
        },
      });
      const regId = '9b1f5af5-d614-179b-ae83-0937a8e3f942';
      // Insert pending
      await transaction.$executeRaw`
        INSERT INTO student_registrations (id, organization_id, person_id, user_id, status, version)
        VALUES (${regId}::uuid, ${org.id}::uuid, ${person.id}::uuid, ${user.id}::uuid, 'PENDING', 1)
      `;
      // Update to APPROVED - allowed
      await transaction.$executeRaw`
        UPDATE student_registrations
        SET status = 'APPROVED', reviewed_at = NOW(), reviewed_by_user_id = ${user.id}::uuid
        WHERE id = ${regId}::uuid
      `;
      // Update APPROVED to REJECTED - rejected by transition trigger
      await harness.expectDatabaseRejection(transaction, async () => {
        await transaction.$executeRaw`
          UPDATE student_registrations
          SET status = 'REJECTED', rejection_reason = 'Too late'
          WHERE id = ${regId}::uuid
        `;
      });
    }));
});
