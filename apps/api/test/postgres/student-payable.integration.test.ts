import { afterAll, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import type { AccessContext } from '@academyops/contracts';
import { FinanceInstallmentReadService } from '../../src/finance/finance-installment-read.service';
import { FinanceAccessService } from '../../src/finance/finance-access.service';
import { PaymobCheckoutService } from '../../src/finance/paymob/paymob-checkout.service';
import { PaymobCheckoutHelper } from '../../src/finance/paymob/paymob-checkout-helper.service';
import { PaymobClient } from '../../src/finance/paymob/paymob.client';
import { AuditService } from '../../src/platform/audit/audit.service';
import { OutboxService } from '../../src/platform/outbox/outbox.service';
import { createTestHarness } from './harness';
import { setupStudentSelfServiceFixture } from './student-self-service-fixture';

const harness = createTestHarness();

harness.databaseDescribe('Student Self-Service Current Installments and Payable Status', () => {
  afterAll(async () => {
    await harness.prisma.$disconnect();
  });

  it('filters by current approved schedule only, handles superseded agreements, and evaluates payable correctly', () =>
    harness.inRollbackTransaction(async (transaction) => {
      const fx = await setupStudentSelfServiceFixture(transaction);
      const financeRead = new FinanceInstallmentReadService(fx.adapter, new FinanceAccessService());
      const config = new ConfigService({
        PAYMOB_SECRET_KEY: 'test-secret-key',
        PAYMOB_PUBLIC_KEY: 'test-pub-key',
        PAYMOB_BASE_URL: 'https://api.paymob.com',
        PAYMOB_CHECKOUT_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
        PAYMOB_HMAC_SECRET: 'test-hmac-secret',
        PAYMOB_PAYMENT_METHOD_IDS: '12345',
        PAYMOB_NOTIFICATION_URL: 'https://example.com/notification',
        PAYMOB_REDIRECTION_URL: 'https://example.com/redirection',
      });
      const client = new PaymobClient(config);
      const helper = new PaymobCheckoutHelper();
      const checkoutService = new PaymobCheckoutService(
        fx.adapter,
        client,
        new AuditService(),
        new OutboxService(),
        helper,
      );

      const studentAAccess: AccessContext = {
        organizationId: fx.orgA.id,
        actorUserId: fx.studentAUser.id,
        grants: new Map([
          ['finance.balance.read', new Set(['S'])],
          ['payments.checkout', new Set(['S'])],
        ]),
        branchIds: new Set([fx.branchA.id]),
        assignedResourceIds: new Set(),
        studentPersonId: fx.personA.id,
      };

      let instPage = await financeRead.listInstallments(studentAAccess, fx.enrollmentA.id, {
        limit: 10,
      });
      expect(instPage.items).toHaveLength(2);
      expect(instPage.items[0]?.payable).toBe(true);
      expect(instPage.items[1]?.payable).toBe(true);

      const agreementV2 = await transaction.pricingAgreement.create({
        data: {
          organizationId: fx.orgA.id,
          enrollmentId: fx.enrollmentA.id,
          version: 2,
          status: 'DRAFT',
          subtotal: '300.00',
          totalAmount: '300.00',
          proposedBy: fx.studentAUser.id,
        },
      });

      await transaction.pricingAgreementLine.create({
        data: {
          organizationId: fx.orgA.id,
          pricingAgreementId: agreementV2.id,
          type: 'TUITION',
          descriptionAr: 'Tuition V2',
          descriptionEn: 'Tuition V2',
          quantity: '1.00',
          unitAmount: '300.00',
          lineAmount: '300.00',
        },
      });

      await transaction.pricingAgreement.update({
        where: { id: agreementV2.id },
        data: { status: 'PROPOSED', lockVersion: { increment: 1 } },
      });

      await transaction.pricingAgreement.update({
        where: { id: fx.agreement.id },
        data: { status: 'SUPERSEDED', lockVersion: { increment: 1 } },
      });

      await transaction.pricingAgreement.update({
        where: { id: agreementV2.id },
        data: {
          status: 'APPROVED',
          approvedBy: fx.studentAUser.id,
          approvedAt: new Date(),
          lockVersion: { increment: 1 },
        },
      });

      const scheduleV2 = await transaction.installmentSchedule.create({
        data: {
          organizationId: fx.orgA.id,
          enrollmentId: fx.enrollmentA.id,
          pricingAgreementId: agreementV2.id,
          version: 2,
          status: 'DRAFT',
        },
      });

      const instV2_1 = await transaction.installment.create({
        data: {
          organizationId: fx.orgA.id,
          scheduleId: scheduleV2.id,
          ordinal: 1,
          dueDate: new Date('2026-06-01'),
          amount: '200.00',
        },
      });

      const debitV2 = await transaction.ledgerEntry.create({
        data: {
          organizationId: fx.orgA.id,
          billingAccountId: fx.billingA.id,
          enrollmentId: fx.enrollmentA.id,
          direction: 'DEBIT',
          entryType: 'INSTALLMENT',
          amount: '200.00',
          sourceType: 'INSTALLMENT',
          sourceId: instV2_1.id,
        },
      });

      await transaction.installment.update({
        where: { id: instV2_1.id },
        data: { debitEntryId: debitV2.id },
      });

      const instV2_2 = await transaction.installment.create({
        data: {
          organizationId: fx.orgA.id,
          scheduleId: scheduleV2.id,
          ordinal: 2,
          dueDate: new Date('2026-07-01'),
          amount: '100.00',
          debitEntryId: null,
        },
      });

      await transaction.installmentSchedule.update({
        where: { id: scheduleV2.id },
        data: {
          status: 'APPROVED',
          approvedBy: fx.studentAUser.id,
          approvedAt: new Date(),
          lockVersion: { increment: 1 },
        },
      });

      instPage = await financeRead.listInstallments(studentAAccess, fx.enrollmentA.id, {
        limit: 10,
      });
      expect(instPage.items).toHaveLength(2);

      const item1 = instPage.items.find((i) => i.id === instV2_1.id);
      const item2 = instPage.items.find((i) => i.id === instV2_2.id);
      expect(item1).toBeDefined();
      expect(item2).toBeDefined();
      expect(item1?.payable).toBe(true);
      expect(item2?.payable).toBe(false);

      let errorThrown: unknown = null;
      try {
        await checkoutService.createCheckout(
          studentAAccess,
          fx.inst1.id,
          'idem-key-v1',
          'correlation-v1',
        );
      } catch (err) {
        errorThrown = err;
      }
      expect(errorThrown).toBeDefined();
      interface NestHttpException {
        getStatus?: () => number;
        status?: number;
        getResponse?: () => unknown;
        response?: unknown;
      }
      const httpError = errorThrown as NestHttpException;
      const status =
        typeof httpError.getStatus === 'function' ? httpError.getStatus() : httpError.status;
      const response =
        typeof httpError.getResponse === 'function' ? httpError.getResponse() : httpError.response;
      expect(status).toBe(404);
      expect(response).toMatchObject({
        code: 'INSTALLMENT_NOT_FOUND',
      });
    }));
});
