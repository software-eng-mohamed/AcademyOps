import { randomUUID } from 'node:crypto';
import { afterAll, it } from 'vitest';
import { createTestHarness } from './postgres/harness';
const { prisma, inRollbackTransaction, expectDatabaseRejection, databaseDescribe } =
  createTestHarness();
databaseDescribe('Phone OTP PostgreSQL migration 029 raw database invariants', () => {
  afterAll(async () => prisma.$disconnect());
  it('enforces composite FK, insert trigger checks, consumed/revoked check, non-decreasing attempts, attempt 5 revocation, and immutability', async () => {
    await inRollbackTransaction(async (transaction) => {
      const org = await transaction.organization.create({
        data: {
          code: `INV-${randomUUID().slice(0, 8)}`.toUpperCase(),
          name: 'Test',
        },
      });
      const person1 = await transaction.person.create({
        data: {
          organizationId: org.id,
          publicId: `PER1-${randomUUID().slice(0, 16)}`,
          name: 'User 1',
        },
      });
      const user1 = await transaction.user.create({
        data: { organizationId: org.id, personId: person1.id, status: 'ACTIVE' },
      });
      const person2 = await transaction.person.create({
        data: {
          organizationId: org.id,
          publicId: `PER2-${randomUUID().slice(0, 16)}`,
          name: 'User 2',
        },
      });
      const user2 = await transaction.user.create({
        data: { organizationId: org.id, personId: person2.id, status: 'ACTIVE' },
      });
      const phoneIdent = await transaction.userLoginIdentifier.create({
        data: {
          organizationId: org.id,
          userId: user1.id,
          type: 'PHONE',
          normalizedValue: '+201234567890',
        },
      });
      const user2Ident = await transaction.userLoginIdentifier.create({
        data: {
          organizationId: org.id,
          userId: user2.id,
          type: 'PHONE',
          normalizedValue: '+201999999999',
        },
      });
      const emailIdent = await transaction.userLoginIdentifier.create({
        data: {
          organizationId: org.id,
          userId: user1.id,
          type: 'EMAIL',
          normalizedValue: 'test@example.com',
        },
      });
      const revokedIdent = await transaction.userLoginIdentifier.create({
        data: {
          organizationId: org.id,
          userId: user1.id,
          type: 'PHONE',
          normalizedValue: '+201888888888',
          revokedAt: new Date(),
        },
      });
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 300000);
      // 1. Composite FK rejection: identifier belonging to another user
      await expectDatabaseRejection(transaction, () =>
        transaction.phoneOtpChallenge.create({
          data: {
            organizationId: org.id,
            userId: user1.id,
            phoneIdentifierId: user2Ident.id,
            normalizedPhone: '+201999999999',
            codeHash: 'hash-fk',
            expiresAt,
          },
        }),
      );
      // 2. Non-PHONE identifier rejection
      await expectDatabaseRejection(transaction, () =>
        transaction.phoneOtpChallenge.create({
          data: {
            organizationId: org.id,
            userId: user1.id,
            phoneIdentifierId: emailIdent.id,
            normalizedPhone: 'test@example.com',
            codeHash: 'hash-email',
            expiresAt,
          },
        }),
      );
      // 3. Revoked identifier rejection
      await expectDatabaseRejection(transaction, () =>
        transaction.phoneOtpChallenge.create({
          data: {
            organizationId: org.id,
            userId: user1.id,
            phoneIdentifierId: revokedIdent.id,
            normalizedPhone: '+201888888888',
            codeHash: 'hash-rev',
            expiresAt,
          },
        }),
      );
      // 4. Normalized phone mismatch rejection
      await expectDatabaseRejection(transaction, () =>
        transaction.phoneOtpChallenge.create({
          data: {
            organizationId: org.id,
            userId: user1.id,
            phoneIdentifierId: phoneIdent.id,
            normalizedPhone: '+201111111111',
            codeHash: 'hash-mismatch',
            expiresAt,
          },
        }),
      );
      // Create valid challenge for update testing
      const challenge = await transaction.phoneOtpChallenge.create({
        data: {
          organizationId: org.id,
          userId: user1.id,
          phoneIdentifierId: phoneIdent.id,
          normalizedPhone: '+201234567890',
          codeHash: 'hash-valid',
          expiresAt,
        },
      });
      await transaction.phoneOtpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: 2 },
      });
      // 5. Attempts decreasing rejection
      await expectDatabaseRejection(transaction, () =>
        transaction.phoneOtpChallenge.update({
          where: { id: challenge.id },
          data: { attempts: 1 },
        }),
      );
      // 6. Attempt 5 without revokedAt rejection
      await expectDatabaseRejection(transaction, () =>
        transaction.phoneOtpChallenge.update({
          where: { id: challenge.id },
          data: { attempts: 5 },
        }),
      );
      // 7. Consumed + revoked together rejection
      await expectDatabaseRejection(transaction, () =>
        transaction.phoneOtpChallenge.update({
          where: { id: challenge.id },
          data: { consumedAt: new Date(), revokedAt: new Date() },
        }),
      );
      // 8. Mutation after terminal state (consumed)
      await transaction.phoneOtpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
      await expectDatabaseRejection(transaction, () =>
        transaction.phoneOtpChallenge.update({
          where: { id: challenge.id },
          data: { codeHash: 'tampered-hash' },
        }),
      );
    });
  });
});
