import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { runHttpScenario } from './http-test-harness';
import { get, patch, post } from './finance-http-client';
import { seedFinanceHttpFixture } from './finance-http-fixture';
import { setupStudentAPricingAndLedger } from '../postgres/student-fixture-helper';
import { accounts, body, databaseDescribe, headers } from './accounts-http-support';

databaseDescribe('Accounts with default branch grants over authenticated HTTP', () => {
  it('records cash once, updates balances and receipts, and keeps bank transfers pending', async () => {
    await runHttpScenario({ permissions: [], roleCode: 'ACCOUNTS' }, async (context) => {
      await accounts(context);
      const fixture = await seedFinanceHttpFixture(context);
      await setupStudentAPricingAndLedger(
        context.prisma,
        context.organizationId,
        fixture.enrollmentId,
        context.userId,
        fixture.billingAccountId,
      );
      const payload = {
        billingAccountId: fixture.billingAccountId,
        enrollmentId: fixture.enrollmentId,
        methodId: fixture.cashMethodId,
        amount: '25.50',
        receivedAt: new Date().toISOString(),
      };
      const key = headers();
      const cash = await body<{ id: string; status: string; receiptSerial: string }>(
        await post(context, 'payments', payload, key),
        201,
      );
      expect(cash.status).toBe('POSTED');
      expect(cash.receiptSerial).toBeTruthy();
      expect((await body(await post(context, 'payments', payload, key), 201)).id).toBe(cash.id);
      expect(
        await context.prisma.payment.count({ where: { organizationId: context.organizationId } }),
      ).toBe(1);
      const balance = await body<{ balance: string; outstandingDebits: string }>(
        await get(context, `enrollments/${fixture.enrollmentId}/finance-summary`),
        200,
      );
      expect(balance).toMatchObject({ balance: '134.50', outstandingDebits: '134.50' });
      const receipt = await context.prisma.internalReceipt.findFirstOrThrow({
        where: { paymentId: cash.id },
      });
      const readReceipt = await body<{ amount: string; paymentId: string }>(
        await get(context, `receipts/${receipt.id}`),
        200,
      );
      expect(readReceipt).toMatchObject({ amount: '25.50', paymentId: cash.id });
      const missingReference = await body(
        await post(
          context,
          'payments',
          { ...payload, methodId: fixture.transferMethodId },
          headers(),
        ),
        409,
      );
      expect(missingReference.code).toBe('EXTERNAL_REFERENCE_REQUIRED');
      const reference = `ACCOUNTS-${randomUUID()}`;
      const transfer = await body(
        await post(
          context,
          'payments',
          {
            ...payload,
            methodId: fixture.transferMethodId,
            amount: '10.25',
            externalReference: reference,
          },
          headers(),
        ),
        201,
      );
      expect(transfer.status).toBe('PENDING_VERIFICATION');
      const duplicate = await body(
        await post(
          context,
          'payments',
          { ...payload, methodId: fixture.transferMethodId, externalReference: reference },
          headers(),
        ),
        409,
      );
      expect(duplicate.code).toBe('PAYMENT_REFERENCE_DUPLICATE');
      expect(
        (
          await body<{ balance: string }>(
            await get(context, `enrollments/${fixture.enrollmentId}/finance-summary`),
            200,
          )
        ).balance,
      ).toBe('134.50');
      expect(
        await context.prisma.internalReceipt.count({ where: { paymentId: transfer.id } }),
      ).toBe(0);
      for (const [id, command, input] of [
        [transfer.id, 'post', undefined],
        [transfer.id, 'reject', { reason: 'Must require reviewer' }],
        [cash.id, 'refund-requests', { amount: '1.00', reason: 'Must require reviewer' }],
        [cash.id, 'reversal-requests', { reason: 'Must require reviewer' }],
        [cash.id, 'receipt', undefined],
      ] as const)
        await body(await post(context, `payments/${id}/${command}`, input, headers()), 403);
      const listed = await body<{ items: Array<{ id: string }> }>(
        await get(context, 'payments?status=PENDING_VERIFICATION'),
        200,
      );
      expect(listed.items.map(({ id }) => id)).toEqual([transfer.id]);
      for (const path of [
        'finance/reports/aging',
        'reports/finance/receivables',
        'payments/method-mix',
        'payment-methods',
        'invoices',
        'receipts',
        'dashboard/workspaces/ACCOUNTS',
      ])
        await body(await get(context, path), 200);
      for (const path of ['payments', 'students', 'enrollments']) {
        if (path !== 'payments') await body(await post(context, path, {}, headers()), 403);
      }
      await body(await post(context, 'invoices', {}, headers()), 403);
      await body(await post(context, 'pricing-agreements', {}, headers()), 403);
      await body(await get(context, `payments/${fixture.foreignPaymentId}`), 404);
      for (const path of ['business-accounts', 'leads', 'certificates', 'reports/exports'])
        await body(await get(context, path), 403);
      const student = await context.prisma.enrollment.findUniqueOrThrow({
        where: { id: fixture.enrollmentId },
      });
      await body(await get(context, `students/${student.studentPersonId}`), 200);
      await body(
        await patch(
          context,
          `students/${student.studentPersonId}`,
          { name: 'Not editable by Accounts' },
          headers(),
        ),
        403,
      );
    });
  });
  it('does not expose another branch through payment, balance, installment or report queries', async () => {
    await runHttpScenario({ permissions: [], roleCode: 'ACCOUNTS' }, async (context) => {
      await accounts(context);
      const fixture = await seedFinanceHttpFixture(context);
      const foreignBranch = await context.prisma.branch.create({
        data: {
          organizationId: context.organizationId,
          code: `OTHER-${randomUUID().slice(0, 8)}`,
          name: 'Out of scope',
        },
      });
      await context.prisma.enrollment.update({
        where: { id: fixture.enrollmentId },
        data: { homeBranchId: foreignBranch.id },
      });
      await setupStudentAPricingAndLedger(
        context.prisma,
        context.organizationId,
        fixture.enrollmentId,
        context.userId,
        fixture.billingAccountId,
      );
      for (const path of [
        `enrollments/${fixture.enrollmentId}`,
        `enrollments/${fixture.enrollmentId}/finance-summary`,
        `billing-accounts/${fixture.billingAccountId}/finance-summary`,
        `enrollments/${fixture.enrollmentId}/installments`,
      ]) {
        const response = await get(context, path);
        expect([403, 404]).toContain(response.status);
      }
      const payment = await post(
        context,
        'payments',
        {
          billingAccountId: fixture.billingAccountId,
          enrollmentId: fixture.enrollmentId,
          methodId: fixture.cashMethodId,
          amount: '5.00',
          receivedAt: new Date().toISOString(),
        },
        headers(),
      );
      expect([403, 404]).toContain(payment.status);
      expect(
        (await body<{ rows: unknown[] }>(await get(context, 'finance/reports/aging'), 200)).rows,
      ).toEqual([]);
      await body(await get(context, `finance/reports/aging?branchId=${foreignBranch.id}`), 404);
      expect(
        await context.prisma.payment.count({ where: { organizationId: context.organizationId } }),
      ).toBe(0);
    });
  });
});
