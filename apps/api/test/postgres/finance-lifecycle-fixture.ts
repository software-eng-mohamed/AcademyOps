import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { Prisma } from '@prisma/client';
import type { AccessContext, PermissionCode } from '@academyops/contracts';
import { FinanceAccessService } from '../../src/finance/finance-access.service';
import { FinanceBalanceReadService } from '../../src/finance/finance-balance-read.service';
import { FinanceHelperService } from '../../src/finance/finance-helper.service';
import { FinanceInstallmentReadService } from '../../src/finance/finance-installment-read.service';
import { FinanceLedgerService } from '../../src/finance/finance-ledger.service';
import { FinancePaymentService } from '../../src/finance/finance-payment.service';
import { FinanceReadHelperService } from '../../src/finance/finance-read-helper.service';
import { FinanceRefundService } from '../../src/finance/finance-refund.service';
import { FinanceReversalService } from '../../src/finance/finance-reversal.service';
import { EnrollmentTransitionService } from '../../src/enrollment/enrollment-transition.service';
import { EnrollmentQueryService } from '../../src/enrollment/enrollment-query.service';
import { EnrollmentEventService } from '../../src/enrollment/enrollment-event.service';
import { CertificateRulesService } from '../../src/certificates/certificate-rules.service';
import { CertificateEligibilityService } from '../../src/certificates/certificate-eligibility.service';
import { AuditService } from '../../src/platform/audit/audit.service';
import { IdempotencyService } from '../../src/platform/idempotency/idempotency.service';
import { OutboxService } from '../../src/platform/outbox/outbox.service';
import { setupStudentSelfServiceFixture } from './student-self-service-fixture';
import { createTransactionPrismaAdapter } from './prisma-adapter';

export const financialMeta = () => ({
  correlationId: 'finance-lifecycle-regression',
  idempotencyKey: randomUUID(),
});

export async function setupFinanceLifecycle(
  transaction: Prisma.TransactionClient,
  activated = true,
) {
  const base = await setupStudentSelfServiceFixture(transaction);
  await transaction.cohort.update({ where: { id: base.cohortA.id }, data: { status: 'PLANNED' } });
  // Enrollment B has no historic financial entries: one price and installment of EGP 100.
  const organizationId = base.orgA.id;
  const enrollmentId = base.enrollmentB.id;
  const billingAccountId = base.billingB.id;
  const agreement = await transaction.pricingAgreement.create({
    data: {
      organizationId,
      enrollmentId,
      version: 1,
      status: 'DRAFT',
      subtotal: '100.00',
      totalAmount: '100.00',
      proposedBy: base.studentAUser.id,
    },
  });
  await transaction.pricingAgreementLine.create({
    data: {
      organizationId,
      pricingAgreementId: agreement.id,
      type: 'TUITION',
      descriptionAr: 'دراسة',
      descriptionEn: 'Tuition',
      quantity: '1',
      unitAmount: '100.00',
      lineAmount: '100.00',
    },
  });
  await transaction.pricingAgreement.update({
    where: { id: agreement.id },
    data: { status: 'PROPOSED', lockVersion: { increment: 1 } },
  });
  await transaction.pricingAgreement.update({
    where: { id: agreement.id },
    data: {
      status: 'APPROVED',
      approvedBy: base.studentBUser.id,
      approvedAt: new Date(),
      lockVersion: { increment: 1 },
    },
  });
  const schedule = await transaction.installmentSchedule.create({
    data: { organizationId, enrollmentId, pricingAgreementId: agreement.id, version: 1 },
  });
  const installment = await transaction.installment.create({
    data: {
      organizationId,
      scheduleId: schedule.id,
      ordinal: 1,
      dueDate: new Date('2026-01-01'),
      amount: '100.00',
    },
  });
  await transaction.installmentSchedule.update({
    where: { id: schedule.id },
    data: {
      status: 'APPROVED',
      approvedBy: base.studentBUser.id,
      approvedAt: new Date(),
      lockVersion: { increment: 1 },
    },
  });
  const method = await transaction.paymentMethod.create({
    data: { organizationId, code: 'CASH', name: 'Cash', verificationRequired: false },
  });
  const permissions: PermissionCode[] = [
    'payments.record',
    'refunds.request',
    'refunds.approve',
    'payments.reverse.request',
    'payments.reverse.approve',
    'finance.balance.read',
    'finance.reports.read',
    'enrollments.activate',
  ];
  const maker: AccessContext = {
    organizationId,
    actorUserId: base.studentAUser.id,
    grants: new Map(permissions.map((permission) => [permission, new Set(['O' as const])])),
    branchIds: new Set([base.branchA.id]),
    assignedResourceIds: new Set(),
  };
  const checker: AccessContext = { ...maker, actorUserId: base.studentBUser.id };
  const adapter = base.adapter;
  // Preserve real transaction rollback semantics for rejected service commands.
  const transactionAdapter = createTransactionPrismaAdapter(transaction);
  adapter.serializable = transactionAdapter.serializable.bind(transactionAdapter);
  const audit = new AuditService(adapter);
  const outbox = new OutboxService();
  const idempotency = new IdempotencyService();
  await transaction.certificateRuleVersion.create({
    data: {
      organizationId,
      programVersionId: base.versionA.id,
      version: 1,
      minimumRatio: '0.80',
      effectiveFrom: new Date('2026-01-01'),
      createdBy: maker.actorUserId,
    },
  });
  const eligibility = new CertificateEligibilityService(
    new CertificateRulesService(adapter, idempotency, audit, outbox),
  );
  const access = new FinanceAccessService();
  const helper = new FinanceHelperService();
  const ledger = new FinanceLedgerService(outbox, helper);
  const payments = new FinancePaymentService(
    adapter,
    audit,
    outbox,
    idempotency,
    access,
    helper,
    ledger,
  );
  const refunds = new FinanceRefundService(adapter, audit, idempotency, access, helper);
  const reversals = new FinanceReversalService(adapter, audit, idempotency, access, helper);
  const reads = new FinanceInstallmentReadService(adapter, access);
  const balances = new FinanceBalanceReadService(adapter, access, new FinanceReadHelperService());
  const transitions = new EnrollmentTransitionService(
    adapter,
    new EnrollmentQueryService(adapter),
    new EnrollmentEventService(audit, outbox),
  );
  const activate = () =>
    transitions.activate(maker, enrollmentId, {
      correlationId: 'finance-lifecycle-regression',
      expectedVersion: base.enrollmentB.version,
    });
  const pay = (amount = '100.00') =>
    payments.createPayment(
      maker,
      {
        billingAccountId,
        enrollmentId,
        methodId: method.id,
        amount,
        receivedAt: new Date().toISOString(),
      },
      financialMeta(),
    );
  const refund = async (paymentId: string, amount: string) => {
    const request = await refunds.requestRefund(
      maker,
      paymentId,
      amount,
      'Refund test',
      financialMeta(),
    );
    return refunds.approveRefund(checker, request.id, financialMeta());
  };
  const reverse = async (paymentId: string) => {
    const request = await reversals.requestReversal(
      maker,
      paymentId,
      'Reversal test',
      financialMeta(),
    );
    return reversals.approveReversal(checker, request.id, financialMeta());
  };
  const assertDebt = async (amount: string, unapplied = '0.00') => {
    // The harness rolls back rather than commits: explicitly exercise deferred DB invariants.
    await transaction.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
    await transaction.$executeRawUnsafe('SET CONSTRAINTS ALL DEFERRED');
    const installmentRead = (await reads.listInstallments(maker, enrollmentId, { limit: 10 }))
      .items[0];
    expect(installmentRead).toMatchObject({
      id: installment.id,
      outstandingAmount: amount,
      payable: Number(amount) > 0,
    });
    const expected = {
      balance: (Number(amount) - Number(unapplied)).toFixed(2),
      outstandingDebits: amount,
      unappliedCredits: unapplied,
    };
    expect(await balances.enrollmentSummary(maker, enrollmentId)).toMatchObject(expected);
    expect(await balances.billingSummary(maker, billingAccountId)).toMatchObject(expected);
    const certificate = await eligibility.snapshot(transaction, organizationId, enrollmentId);
    expect(certificate.outstanding.toFixed(2)).toBe(amount);
    expect(certificate.financialHold).toBe(Number(amount) > 0);
    const aging = await balances.aging(maker, { asOf: '2026-09-08' });
    const debt = aging.rows
      .filter((row) => row.enrollmentId === enrollmentId)
      .reduce((sum, row) => sum + Number(row.outstanding), 0);
    expect(debt.toFixed(2)).toBe(amount);
  };
  if (activated) await activate();
  return {
    organizationId,
    enrollmentId,
    billingAccountId,
    installment,
    maker,
    checker,
    payments,
    refunds,
    reversals,
    reads,
    balances,
    activate,
    pay,
    refund,
    reverse,
    assertDebt,
  };
}
