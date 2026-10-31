import { randomUUID } from 'node:crypto';
import type { AccessContext } from '@academyops/contracts';
import { afterAll, expect, it } from 'vitest';
import { FinanceAccessService } from '../../src/finance/finance-access.service';
import { createTestHarness } from './harness';
const { prisma, inRollbackTransaction, expectDatabaseRejection, databaseDescribe } =
  createTestHarness();
databaseDescribe('PostgreSQL contract', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });
  it('binds one active Paymob attempt to the exact installment and keeps gateway events append-only', async () => {
    await inRollbackTransaction(async (transaction) => {
      const organization = await transaction.organization.create({
        data: { code: `GATEWAY-${randomUUID()}`, name: 'Gateway Test' },
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
          name: 'Gateway Student',
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
          code: 'GATEWAY-PROGRAM',
          name: 'Program',
        },
      });
      const version = await transaction.programVersion.create({
        data: {
          organizationId: organization.id,
          programId: program.id,
          version: 1,
        },
      });
      const gatewayModule = await transaction.academicModule.create({
        data: {
          organizationId: organization.id,
          code: 'GATEWAY-MODULE',
          name: 'Module',
        },
      });
      await transaction.programVersionModule.create({
        data: {
          organizationId: organization.id,
          programVersionId: version.id,
          moduleId: gatewayModule.id,
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
      const otherBranch = await transaction.branch.create({
        data: {
          organizationId: organization.id,
          code: 'OTHER',
          name: 'Other',
        },
      });
      const otherPerson = await transaction.person.create({
        data: {
          organizationId: organization.id,
          publicId: `OTHER-${randomUUID().slice(0, 18)}`,
          name: 'Other Student',
        },
      });
      await transaction.studentProfile.create({
        data: { organizationId: organization.id, personId: otherPerson.id },
      });
      const otherBilling = await transaction.billingAccount.create({
        data: {
          organizationId: organization.id,
          kind: 'INDIVIDUAL',
          personId: otherPerson.id,
        },
      });
      const otherEnrollment = await transaction.enrollment.create({
        data: {
          organizationId: organization.id,
          studentPersonId: otherPerson.id,
          programVersionId: version.id,
          billingAccountId: otherBilling.id,
          homeBranchId: otherBranch.id,
        },
      });
      const access = {
        organizationId: organization.id,
        actorUserId: user.id,
        grants: new Map([['payments.record', new Set(['B'])]]),
        branchIds: new Set([branch.id]),
        assignedResourceIds: new Set<string>(),
      } as AccessContext;
      const financeAccess = new FinanceAccessService();
      await expect(
        financeAccess.assertBillingAccount(
          transaction,
          access,
          'payments.record',
          billing.id,
          enrollment.id,
        ),
      ).resolves.toMatchObject({ id: billing.id });
      await expect(
        financeAccess.assertBillingAccount(
          transaction,
          access,
          'payments.record',
          otherBilling.id,
          otherEnrollment.id,
        ),
      ).rejects.toMatchObject({ response: { code: 'FINANCE_RESOURCE_NOT_FOUND' } });
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
      const attempt = await transaction.paymentGatewayAttempt.create({
        data: {
          organizationId: organization.id,
          installmentId: installment.id,
          enrollmentId: enrollment.id,
          billingAccountId: billing.id,
          internalReference: `PLG-${randomUUID()}`,
          amount: '100.00',
          idempotencyKey: 'gateway-one',
          createdBy: user.id,
        },
      });
      await expectDatabaseRejection(transaction, () =>
        transaction.paymentGatewayAttempt.create({
          data: {
            organizationId: organization.id,
            installmentId: installment.id,
            enrollmentId: enrollment.id,
            billingAccountId: billing.id,
            internalReference: `PLG-${randomUUID()}`,
            amount: '100.00',
            idempotencyKey: 'gateway-two',
            createdBy: user.id,
          },
        }),
      );
      await expectDatabaseRejection(transaction, () =>
        transaction.paymentGatewayAttempt.update({
          where: { id: attempt.id },
          data: { amount: '99.00' },
        }),
      );
      const event = await transaction.paymentGatewayEvent.create({
        data: {
          organizationId: organization.id,
          attemptId: attempt.id,
          providerEventId: 'paymob-transaction-1',
          eventType: 'TRANSACTION_PENDING',
          payloadDigest: 'a'.repeat(64),
          processedAt: new Date(),
        },
      });
      await expectDatabaseRejection(transaction, () =>
        transaction.paymentGatewayEvent.update({
          where: { id: event.id },
          data: { payloadDigest: 'b'.repeat(64) },
        }),
      );
    });
  });
});
