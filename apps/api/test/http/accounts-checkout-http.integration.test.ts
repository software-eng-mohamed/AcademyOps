import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { PaymobClient } from '../../src/finance/paymob/paymob.client';
import { setupStudentAPricingAndLedger } from '../postgres/student-fixture-helper';
import { accounts, body, databaseDescribe, headers } from './accounts-http-support';
import { get, post } from './finance-http-client';
import { seedFinanceHttpFixture } from './finance-http-fixture';
import { runHttpScenario } from './http-test-harness';

databaseDescribe('Accounts installment checkout with a fake gateway', () => {
  it('creates one attempt for the unpaid amount, reads status, and enforces branch scope', async () => {
    const createIntention = vi.fn().mockResolvedValue({
      intentionId: 'accounts-synthetic-intention',
      clientSecret: 'synthetic-only',
      checkoutUrl: 'https://gateway.invalid/unifiedcheckout/?synthetic=1',
    });
    await runHttpScenario(
      {
        permissions: [],
        roleCode: 'ACCOUNTS',
        overrides: [
          {
            token: PaymobClient,
            value: {
              configuration: () => ({
                baseUrl: 'https://gateway.invalid',
                secretKey: 'synthetic-only',
                publicKey: 'synthetic-public',
                hmacSecret: 'a'.repeat(64),
                paymentMethodIds: [1],
                notificationUrl: 'https://academy.invalid/webhook',
                redirectionUrl: 'https://academy.invalid/return',
                encryptionKey: Buffer.alloc(32, 7).toString('base64'),
              }),
              createIntention,
            },
          },
        ],
      },
      async (context) => {
        await accounts(context);
        const fixture = await seedFinanceHttpFixture(context);
        const { inst1, inst2 } = await setupStudentAPricingAndLedger(
          context.prisma,
          context.organizationId,
          fixture.enrollmentId,
          context.userId,
          fixture.billingAccountId,
        );
        const enrollment = await context.prisma.enrollment.findUniqueOrThrow({
          where: { id: fixture.enrollmentId },
        });
        await context.prisma.personContact.createMany({
          data: [
            {
              organizationId: context.organizationId,
              personId: enrollment.studentPersonId,
              type: 'EMAIL',
              rawValue: 'accounts-student@e2e.invalid',
              normalizedValue: 'accounts-student@e2e.invalid',
              isPrimary: true,
            },
            {
              organizationId: context.organizationId,
              personId: enrollment.studentPersonId,
              type: 'PHONE',
              rawValue: '+201001234567',
              normalizedValue: '+201001234567',
              isPrimary: true,
            },
          ],
        });
        await context.prisma.paymentMethod.create({
          data: {
            organizationId: context.organizationId,
            code: 'PAYMOB',
            name: 'Paymob',
            verificationRequired: false,
          },
        });
        const key = headers();
        const path = `installments/${inst1.id}/paymob-checkout`;
        const created = await body<{
          attemptId: string;
          status: string;
          amount: string;
          paymentId: string | null;
        }>(await post(context, path, undefined, key), 201);
        expect(created).toMatchObject({ status: 'PENDING', amount: '60.00', paymentId: null });
        const repeated = await body<{ attemptId: string }>(
          await post(context, path, undefined, key),
          201,
        );
        expect(repeated.attemptId).toBe(created.attemptId);
        expect(createIntention).toHaveBeenCalledTimes(1);
        const status = await body<{ status: string; paymentId: string | null }>(
          await get(context, `payment-gateway-attempts/${created.attemptId}`),
          200,
        );
        expect(status).toMatchObject({ status: 'PENDING', paymentId: null });
        expect((await body(await post(context, path, undefined, headers()), 409)).code).toBe(
          'PAYMOB_INSTALLMENT_ATTEMPT_ACTIVE',
        );
        expect(
          await context.prisma.payment.count({ where: { organizationId: context.organizationId } }),
        ).toBe(0);
        expect(
          (
            await body<{ balance: string }>(
              await get(context, `enrollments/${fixture.enrollmentId}/finance-summary`),
              200,
            )
          ).balance,
        ).toBe('160.00');
        const otherBranch = await context.prisma.branch.create({
          data: {
            organizationId: context.organizationId,
            code: `OTHER-${randomUUID().slice(0, 8)}`,
            name: 'Outside scope',
          },
        });
        await context.prisma.enrollment.update({
          where: { id: fixture.enrollmentId },
          data: { homeBranchId: otherBranch.id },
        });
        await body(await get(context, `payment-gateway-attempts/${created.attemptId}`), 403);
        await body(
          await post(context, `installments/${inst2.id}/paymob-checkout`, undefined, headers()),
          403,
        );
        expect(createIntention).toHaveBeenCalledTimes(1);
      },
    );
  });
});
