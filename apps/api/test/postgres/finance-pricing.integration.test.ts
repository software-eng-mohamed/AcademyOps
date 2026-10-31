import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { createTestHarness } from './harness';
const { prisma, inRollbackTransaction, expectDatabaseRejection, databaseDescribe } =
  createTestHarness();
databaseDescribe('PostgreSQL contract', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });
  it('enforces pricing approval and installment immutability in the database', async () => {
    await inRollbackTransaction(async (transaction) => {
      const organization = await transaction.organization.create({
        data: { code: `PRICING-${randomUUID()}`, name: 'Pricing' },
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
          publicId: `STU-${randomUUID().slice(0, 20)}`,
          name: 'Pricing Student',
        },
      });
      const user = await transaction.user.create({
        data: { organizationId: organization.id, personId: person.id, status: 'ACTIVE' },
      });
      await transaction.studentProfile.create({
        data: { organizationId: organization.id, personId: person.id },
      });
      const billing = await transaction.billingAccount.create({
        data: { organizationId: organization.id, kind: 'INDIVIDUAL', personId: person.id },
      });
      const program = await transaction.program.create({
        data: {
          organizationId: organization.id,
          code: 'PRICING-PROGRAM',
          name: 'Program',
        },
      });
      const version = await transaction.programVersion.create({
        data: { organizationId: organization.id, programId: program.id, version: 1 },
      });
      const module = await transaction.academicModule.create({
        data: {
          organizationId: organization.id,
          code: 'PRICING-MODULE',
          name: 'Module',
        },
      });
      await transaction.programVersionModule.create({
        data: {
          organizationId: organization.id,
          programVersionId: version.id,
          moduleId: module.id,
          ordinal: 1,
        },
      });
      await transaction.programVersion.update({
        where: { id: version.id },
        data: { status: 'PUBLISHED', effectiveFrom: new Date('2026-01-01') },
      });
      const enrollment = await transaction.enrollment.create({
        data: {
          organizationId: organization.id,
          studentPersonId: person.id,
          programVersionId: version.id,
          billingAccountId: billing.id,
          homeBranchId: branch.id,
        },
      });
      const agreement = await transaction.pricingAgreement.create({
        data: {
          organizationId: organization.id,
          enrollmentId: enrollment.id,
          version: 1,
          subtotal: '100.00',
          discountAmount: '0.00',
          totalAmount: '100.00',
          proposedBy: user.id,
        },
      });
      const line = await transaction.pricingAgreementLine.create({
        data: {
          organizationId: organization.id,
          pricingAgreementId: agreement.id,
          type: 'TUITION',
          descriptionAr: 'Tuition',
          descriptionEn: 'Tuition',
          quantity: '1.00',
          unitAmount: '100.00',
          lineAmount: '100.00',
        },
      });
      await expectDatabaseRejection(transaction, () =>
        transaction.pricingAgreement.update({
          where: { id: agreement.id },
          data: { status: 'APPROVED', approvedBy: user.id, approvedAt: new Date() },
        }),
      );
      await transaction.pricingAgreement.update({
        where: { id: agreement.id },
        data: { status: 'PROPOSED', lockVersion: { increment: 1 } },
      });
      await expectDatabaseRejection(transaction, () =>
        transaction.pricingAgreementLine.update({
          where: { id: line.id },
          data: { lineAmount: '99.00', unitAmount: '99.00' },
        }),
      );
      await transaction.pricingAgreement.update({
        where: { id: agreement.id },
        data: {
          status: 'APPROVED',
          approvedBy: user.id,
          approvedAt: new Date(),
          lockVersion: { increment: 1 },
        },
      });
      const schedule = await transaction.installmentSchedule.create({
        data: {
          organizationId: organization.id,
          enrollmentId: enrollment.id,
          pricingAgreementId: agreement.id,
          version: 1,
        },
      });
      const installment = await transaction.installment.create({
        data: {
          organizationId: organization.id,
          scheduleId: schedule.id,
          ordinal: 1,
          dueDate: new Date('2026-09-01'),
          amount: '100.00',
        },
      });
      await transaction.installmentSchedule.update({
        where: { id: schedule.id },
        data: {
          status: 'APPROVED',
          approvedBy: user.id,
          approvedAt: new Date(),
          lockVersion: { increment: 1 },
        },
      });
      await expectDatabaseRejection(transaction, () =>
        transaction.installment.update({
          where: { id: installment.id },
          data: { amount: '90.00' },
        }),
      );
      const debit = await transaction.ledgerEntry.create({
        data: {
          organizationId: organization.id,
          billingAccountId: billing.id,
          enrollmentId: enrollment.id,
          direction: 'DEBIT',
          entryType: 'INSTALLMENT',
          amount: '100.00',
          sourceType: 'INSTALLMENT',
          sourceId: installment.id,
        },
      });
      await expect(
        transaction.installment.update({
          where: { id: installment.id },
          data: { debitEntryId: debit.id },
        }),
      ).resolves.toMatchObject({ debitEntryId: debit.id });
      await expectDatabaseRejection(transaction, () =>
        transaction.installmentSchedule.update({
          where: { id: schedule.id },
          data: { status: 'DRAFT' },
        }),
      );
      await transaction.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
    });
  });
});
