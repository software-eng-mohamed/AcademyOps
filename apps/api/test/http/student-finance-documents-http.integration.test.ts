import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { ids, fixture } from './student-role-http-support';
import { databaseDescribe, responseBody } from './attendance-role-http-support';
import { get } from './finance-http-client';
import { runHttpScenario } from './http-test-harness';

databaseDescribe('Student financial documents using actual self-only grants', () => {
  it('lists and reads own populated financial documents, rejecting same-company peer documents', async () => {
    await runHttpScenario({ permissions: [], roleCode: 'STUDENT' }, async (context) => {
      const f = await fixture(context);
      const { prisma, organizationId, userId } = context;
      const method = await prisma.paymentMethod.create({
        data: { organizationId, code: 'CASH', name: 'Cash', verificationRequired: false },
      });
      const documents = [];
      for (const [index, enrollmentId] of [f.enrollmentId, f.secondEnrollmentId].entries()) {
        const enrollment = await prisma.enrollment.findUniqueOrThrow({
          where: { id: enrollmentId },
        });
        const billingAccountId = enrollment.billingAccountId;
        const payment = await prisma.payment.create({
          data: {
            organizationId,
            billingAccountId,
            enrollmentId,
            methodId: method.id,
            status: 'POSTED',
            amount: '40.00',
            idempotencyKey: randomUUID(),
            receivedAt: new Date(),
            postedAt: new Date(),
            createdBy: userId,
          },
        });
        const receipt = await prisma.internalReceipt.create({
          data: {
            organizationId,
            billingAccountId,
            paymentId: payment.id,
            fiscalYear: 2026,
            serialNumber: BigInt(index + 1),
            amount: '40.00',
            payerSnapshot: {},
            createdBy: userId,
          },
        });
        const invoice = await prisma.internalInvoice.create({
          data: {
            organizationId,
            billingAccountId,
            subtotal: '40.00',
            totalAmount: '40.00',
            createdBy: userId,
          },
        });
        documents.push({ payments: payment.id, invoices: invoice.id, receipts: receipt.id });
      }
      const own = documents[0];
      const peer = documents[1];
      if (!own || !peer) throw new Error('Missing fixture');
      for (const resource of ['payments', 'invoices', 'receipts'] as const) {
        expect(ids(await responseBody(await get(context, resource), 200))).toEqual([own[resource]]);
        await responseBody(await get(context, `${resource}/${own[resource]}`), 200);
        await responseBody(await get(context, `${resource}/${peer[resource]}`), 404);
      }
    });
  });
});
