import { randomUUID } from 'node:crypto';
import { afterAll, it } from 'vitest';
import { createTestHarness } from './harness';
const { prisma, inRollbackTransaction, expectDatabaseRejection, databaseDescribe } =
  createTestHarness();
databaseDescribe('WhatsApp OTP persistence constraints', () => {
  afterAll(async () => prisma.$disconnect());
  it('enforces one tenant channel, immutable identity, valid state, and encrypted auth records', () =>
    inRollbackTransaction(async (transaction) => {
      const organization = await transaction.organization.create({
        data: {
          code: `WA-${randomUUID().slice(0, 8)}`,
          name: 'WhatsApp OTP',
        },
      });
      const channel = await transaction.whatsappOtpChannel.create({
        data: {
          organizationId: organization.id,
          enabled: true,
          desiredState: 'CONNECTED',
          state: 'STARTING',
          commandVersion: 1,
        },
      });
      await transaction.whatsappAuthRecord.create({
        data: {
          organizationId: organization.id,
          category: 'creds',
          keyId: 'default',
          valueCipher: `v1.${'a'.repeat(40)}`,
        },
      });
      await expectDatabaseRejection(transaction, () =>
        transaction.whatsappOtpChannel.create({
          data: { organizationId: organization.id },
        }),
      );
      await expectDatabaseRejection(transaction, () =>
        transaction.whatsappOtpChannel.update({
          where: { id: channel.id },
          data: { state: 'UNSAFE' },
        }),
      );
      await expectDatabaseRejection(transaction, () =>
        transaction.whatsappOtpChannel.update({
          where: { id: channel.id },
          data: { commandVersion: 0 },
        }),
      );
      await expectDatabaseRejection(transaction, () =>
        transaction.whatsappAuthRecord.create({
          data: {
            organizationId: organization.id,
            category: 'session',
            keyId: 'empty-cipher',
            valueCipher: 'plaintext',
          },
        }),
      );
    }));
});
