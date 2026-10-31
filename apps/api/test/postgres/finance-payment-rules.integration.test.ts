import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import type { PrismaService } from '../../src/platform/database/prisma.service';
import { FinancePaymentService } from '../../src/finance/finance-payment.service';
import { FinanceAccessService } from '../../src/finance/finance-access.service';
import { FinanceHelperService } from '../../src/finance/finance-helper.service';
import { FinanceLedgerService } from '../../src/finance/finance-ledger.service';
import { AuditService } from '../../src/platform/audit/audit.service';
import { OutboxService } from '../../src/platform/outbox/outbox.service';
import { IdempotencyService } from '../../src/platform/idempotency/idempotency.service';
import { createTestHarness } from './harness';
const harness = createTestHarness();
function createFinancePrismaAdapter(tx: Prisma.TransactionClient): PrismaService {
  return new Proxy(tx, {
    get(target, prop) {
      if (prop === 'serializable') {
        return async <T>(work: (t: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
          await tx.$executeRawUnsafe('SAVEPOINT serializable_work');
          try {
            const res = await work(tx);
            await tx.$executeRawUnsafe('RELEASE SAVEPOINT serializable_work');
            return res;
          } catch (err) {
            await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT serializable_work');
            await tx.$executeRawUnsafe('RELEASE SAVEPOINT serializable_work');
            throw err;
          }
        };
      }
      const targetObj = target as unknown as Record<string | symbol, unknown>;
      const val = targetObj[prop];
      if (typeof val === 'function') {
        return (val as (...args: unknown[]) => unknown).bind(target);
      }
      return val;
    },
  }) as unknown as PrismaService;
}
harness.databaseDescribe('Finance Payment Rules and Permissions', () => {
  afterAll(async () => {
    await harness.prisma.$disconnect();
  });
  it('enforces method policy and roles permissions for payment recording and verification', () =>
    harness.inRollbackTransaction(async (transaction) => {
      const org = await transaction.organization.create({
        data: { code: `T-${randomUUID().slice(0, 8)}`, name: 'Finance' },
      });
      const branch = await transaction.branch.create({
        data: { organizationId: org.id, code: 'MAIN', name: 'Main' },
      });
      const ownP = await transaction.person.create({
        data: { organizationId: org.id, publicId: `O-`, name: 'Owner' },
      });
      const ownerUser = await transaction.user.create({
        data: { organizationId: org.id, personId: ownP.id, status: 'ACTIVE' },
      });
      const acctP = await transaction.person.create({
        data: { organizationId: org.id, publicId: `A-`, name: 'Accounts' },
      });
      const accountsUser = await transaction.user.create({
        data: { organizationId: org.id, personId: acctP.id, status: 'ACTIVE' },
      });
      const studP = await transaction.person.create({
        data: { organizationId: org.id, publicId: `S-`, name: 'Student' },
      });
      await transaction.studentProfile.create({
        data: { organizationId: org.id, personId: studP.id },
      });
      const billingAccount = await transaction.billingAccount.create({
        data: { organizationId: org.id, kind: 'INDIVIDUAL', personId: studP.id },
      });
      const prog = await transaction.program.create({
        data: { organizationId: org.id, code: 'PROG', name: 'Program' },
      });
      const pVer = await transaction.programVersion.create({
        data: { organizationId: org.id, programId: prog.id, version: 1 },
      });
      const m = await transaction.academicModule.create({
        data: { organizationId: org.id, code: 'MOD', name: 'Module' },
      });
      await transaction.programVersionModule.create({
        data: { organizationId: org.id, programVersionId: pVer.id, moduleId: m.id, ordinal: 1 },
      });
      await transaction.programVersion.update({
        where: { id: pVer.id },
        data: { status: 'PUBLISHED', effectiveFrom: new Date('2026-01-01') },
      });
      const enrollment = await transaction.enrollment.create({
        data: {
          organizationId: org.id,
          studentPersonId: studP.id,
          programVersionId: pVer.id,
          billingAccountId: billingAccount.id,
          homeBranchId: branch.id,
        },
      });
      const cashD = {
        organizationId: org.id,
        code: 'CASH',
        name: 'Cash',
        verificationRequired: false,
      };
      const cashMethod = await transaction.paymentMethod.create({ data: cashD });
      const instaD = {
        organizationId: org.id,
        code: 'INSTAPAY',
        name: 'Insta',
        verificationRequired: true,
      };
      const instapayMethod = await transaction.paymentMethod.create({ data: instaD });
      const mobD = {
        organizationId: org.id,
        code: 'PAYMOB',
        name: 'Paymob',
        verificationRequired: false,
      };
      const paymobMethod = await transaction.paymentMethod.create({ data: mobD });
      const adapter = createFinancePrismaAdapter(transaction);
      const ledger = new FinanceLedgerService(new OutboxService(), new FinanceHelperService());
      const service = new FinancePaymentService(
        adapter,
        new AuditService(),
        new OutboxService(),
        new IdempotencyService(adapter),
        new FinanceAccessService(),
        new FinanceHelperService(),
        ledger,
      );
      const accountsAccess: AccessContext = {
        organizationId: org.id,
        actorUserId: accountsUser.id,
        grants: new Map([
          ['payments.read', new Set(['B'])],
          ['payments.record', new Set(['B'])],
        ]),
        branchIds: new Set([branch.id]),
        assignedResourceIds: new Set(),
      };
      const ownerAccess: AccessContext = {
        organizationId: org.id,
        actorUserId: ownerUser.id,
        grants: new Map([
          ['payments.read', new Set(['O'])],
          ['payments.record', new Set(['O'])],
          ['payments.verify', new Set(['O'])],
        ]),
        branchIds: new Set([branch.id]),
        assignedResourceIds: new Set(),
      };
      const meta = (key: string) => ({ correlationId: 'corr-id', idempotencyKey: key });
      await expect(
        service.createPayment(
          accountsAccess,
          {
            billingAccountId: billingAccount.id,
            enrollmentId: enrollment.id,
            methodId: paymobMethod.id,
            amount: '100.00',
            receivedAt: new Date().toISOString(),
          },
          meta('paymob-manual'),
        ),
      ).rejects.toMatchObject({ response: { code: 'PAYMOB_MANUAL_CREATION_REJECTED' } });
      await expect(
        service.createPayment(
          accountsAccess,
          {
            billingAccountId: billingAccount.id,
            enrollmentId: enrollment.id,
            methodId: instapayMethod.id,
            amount: '150.00',
            receivedAt: new Date().toISOString(),
          },
          meta('instapay-missing-ref'),
        ),
      ).rejects.toMatchObject({ response: { code: 'EXTERNAL_REFERENCE_REQUIRED' } });
      const cashRes = await service.createPayment(
        accountsAccess,
        {
          billingAccountId: billingAccount.id,
          enrollmentId: enrollment.id,
          methodId: cashMethod.id,
          amount: '200.00',
          receivedAt: new Date().toISOString(),
        },
        meta('cash-ok'),
      );
      expect(cashRes.status).toBe('POSTED');
      const instapayRes = await service.createPayment(
        accountsAccess,
        {
          billingAccountId: billingAccount.id,
          enrollmentId: enrollment.id,
          methodId: instapayMethod.id,
          amount: '250.00',
          receivedAt: new Date().toISOString(),
          externalReference: 'TXN-12345',
        },
        meta('instapay-ok'),
      );
      expect(instapayRes.status).toBe('PENDING_VERIFICATION');
      await expect(
        service.postPayment(accountsAccess, instapayRes.id, instapayRes.version, meta('post-fail')),
      ).rejects.toMatchObject({ response: { code: 'FINANCE_RESOURCE_NOT_FOUND' } });
      await expect(
        service.rejectPayment(
          accountsAccess,
          instapayRes.id,
          'Fraud suspected',
          instapayRes.version,
          meta('reject-fail'),
        ),
      ).rejects.toMatchObject({ response: { code: 'FINANCE_RESOURCE_NOT_FOUND' } });
      const ownerPostRes = await service.postPayment(
        ownerAccess,
        instapayRes.id,
        instapayRes.version,
        meta('post-ok'),
      );
      expect(ownerPostRes.status).toBe('POSTED');
      await expect(
        service.createPayment(
          accountsAccess,
          {
            billingAccountId: billingAccount.id,
            enrollmentId: enrollment.id,
            methodId: instapayMethod.id,
            amount: '250.00',
            receivedAt: new Date().toISOString(),
            externalReference: ' txn-12345 ',
          },
          meta('duplicate-reference'),
        ),
      ).rejects.toMatchObject({ response: { code: 'PAYMENT_REFERENCE_DUPLICATE' } });
      await transaction.paymentMethod.update({
        where: { id: instapayMethod.id },
        data: { verificationRequired: false },
      });
      const misconfiguredRes = await service.createPayment(
        accountsAccess,
        {
          billingAccountId: billingAccount.id,
          enrollmentId: enrollment.id,
          methodId: instapayMethod.id,
          amount: '300.00',
          receivedAt: new Date().toISOString(),
          externalReference: 'TXN-999',
        },
        meta('instapay-misconfigured'),
      );
      expect(misconfiguredRes.status).toBe('PENDING_VERIFICATION');
      await expect(
        transaction.payment.create({
          data: {
            organizationId: org.id,
            billingAccountId: billingAccount.id,
            enrollmentId: enrollment.id,
            methodId: instapayMethod.id,
            status: 'POSTED',
            amount: new Prisma.Decimal('300.00'),
            externalReference: 'TXN-DB-TRIGGER',
            idempotencyKey: 'db-trigger-key',
            receivedAt: new Date(),
            createdBy: accountsUser.id,
          },
        }),
      ).rejects.toThrow();
    }));
});
