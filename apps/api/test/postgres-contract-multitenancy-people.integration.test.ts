import { randomUUID } from 'node:crypto';
import { afterAll, it } from 'vitest';
import { createTestHarness } from './postgres/harness';
const { prisma, inRollbackTransaction, expectDatabaseRejection, databaseDescribe } =
  createTestHarness();
databaseDescribe('PostgreSQL contract - Multitenancy & People', () => {
  afterAll(async () => prisma.$disconnect());
  it('rejects cross-organization foreign keys and ledger mutation', async () => {
    await inRollbackTransaction(async (transaction) => {
      const [firstOrganization, secondOrganization] = await Promise.all([
        transaction.organization.create({
          data: { code: `TENANT-A-${randomUUID()}`, name: 'A' },
        }),
        transaction.organization.create({
          data: { code: `TENANT-B-${randomUUID()}`, name: 'B' },
        }),
      ]);
      const foreignBranch = await transaction.branch.create({
        data: {
          organizationId: secondOrganization.id,
          code: 'FOREIGN',
          name: 'Branch',
        },
      });
      await expectDatabaseRejection(transaction, () =>
        transaction.room.create({
          data: {
            organizationId: firstOrganization.id,
            branchId: foreignBranch.id,
            code: 'ROOM',
            name: 'Room',
          },
        }),
      );
      const person = await transaction.person.create({
        data: {
          organizationId: firstOrganization.id,
          publicId: `P-${randomUUID().slice(0, 24)}`,
          name: 'Ledger Test',
        },
      });
      const billing = await transaction.billingAccount.create({
        data: { organizationId: firstOrganization.id, kind: 'INDIVIDUAL', personId: person.id },
      });
      const entry = await transaction.ledgerEntry.create({
        data: {
          organizationId: firstOrganization.id,
          billingAccountId: billing.id,
          direction: 'DEBIT',
          entryType: 'TEST',
          amount: '100.00',
          sourceType: 'TEST',
          sourceId: randomUUID(),
        },
      });
      await expectDatabaseRejection(transaction, () =>
        transaction.ledgerEntry.update({ where: { id: entry.id }, data: { amount: '99.00' } }),
      );
    });
  });
  it('enforces one payer account and one primary contact of each type', async () => {
    await inRollbackTransaction(async (transaction) => {
      const organization = await transaction.organization.create({
        data: { code: `PEOPLE-${randomUUID()}`, name: 'People Test' },
      });
      const branch = await transaction.branch.create({
        data: {
          organizationId: organization.id,
          code: 'MAIN',
          name: 'Main',
        },
      });
      const person = await transaction.person.create({
        data: {
          organizationId: organization.id,
          publicId: `P-${randomUUID().slice(0, 24)}`,
          name: 'Student',
        },
      });
      await transaction.studentProfile.create({
        data: { organizationId: organization.id, personId: person.id },
      });
      await transaction.billingAccount.create({
        data: { organizationId: organization.id, kind: 'INDIVIDUAL', personId: person.id },
      });
      await expectDatabaseRejection(transaction, () =>
        transaction.billingAccount.create({
          data: { organizationId: organization.id, kind: 'INDIVIDUAL', personId: person.id },
        }),
      );
      await transaction.personContact.create({
        data: {
          organizationId: organization.id,
          personId: person.id,
          type: 'PHONE',
          rawValue: '01000000000',
          normalizedValue: '+201000000000',
          isPrimary: true,
        },
      });
      await expectDatabaseRejection(transaction, () =>
        transaction.personContact.create({
          data: {
            organizationId: organization.id,
            personId: person.id,
            type: 'PHONE',
            rawValue: '01111111111',
            normalizedValue: '+201111111111',
            isPrimary: true,
          },
        }),
      );
      const business = await transaction.businessAccount.create({
        data: {
          organizationId: organization.id,
          owningBranchId: branch.id,
          legalName: 'Company LLC',
          displayName: 'Company',
        },
      });
      await transaction.billingAccount.create({
        data: {
          organizationId: organization.id,
          kind: 'CORPORATE',
          businessAccountId: business.id,
        },
      });
      await expectDatabaseRejection(transaction, () =>
        transaction.billingAccount.create({
          data: {
            organizationId: organization.id,
            kind: 'CORPORATE',
            businessAccountId: business.id,
          },
        }),
      );
    });
  });
});
