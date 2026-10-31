import { randomUUID } from 'node:crypto';
import { afterAll, it } from 'vitest';
import { createTestHarness } from './harness';
const { prisma, inRollbackTransaction, expectDatabaseRejection, databaseDescribe } =
  createTestHarness();
databaseDescribe('PostgreSQL contract', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });
  it('locks issued invoice lines and rejects credit notes above the invoice total', async () => {
    await inRollbackTransaction(async (transaction) => {
      const organization = await transaction.organization.create({
        data: { code: `INV-${randomUUID()}`, name: 'Test' },
      });
      const person = await transaction.person.create({
        data: {
          organizationId: organization.id,
          publicId: `P-${randomUUID().slice(0, 24)}`,
          name: 'Invoice Test',
        },
      });
      const billing = await transaction.billingAccount.create({
        data: { organizationId: organization.id, kind: 'INDIVIDUAL', personId: person.id },
      });
      const debit = await transaction.ledgerEntry.create({
        data: {
          organizationId: organization.id,
          billingAccountId: billing.id,
          direction: 'DEBIT',
          entryType: 'TEST_INVOICE',
          amount: '100.00',
          sourceType: 'TEST_INVOICE',
          sourceId: randomUUID(),
        },
      });
      const invoice = await transaction.internalInvoice.create({
        data: {
          organizationId: organization.id,
          billingAccountId: billing.id,
          subtotal: '100.00',
          taxAmount: '0.00',
          totalAmount: '100.00',
          createdBy: randomUUID(),
        },
      });
      const line = await transaction.invoiceLine.create({
        data: {
          organizationId: organization.id,
          invoiceId: invoice.id,
          ledgerEntryId: debit.id,
          descriptionAr: 'اختبار',
          descriptionEn: 'Test',
          quantity: '1.00',
          unitAmount: '100.00',
          taxAmount: '0.00',
          lineTotal: '100.00',
        },
      });
      await transaction.internalInvoice.update({
        where: { id: invoice.id },
        data: {
          status: 'ISSUED',
          fiscalYear: 2026,
          serialNumber: 1,
          customerSnapshot: { name: 'Test' },
          issuedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await expectDatabaseRejection(transaction, () =>
        transaction.invoiceLine.update({
          where: { id: line.id },
          data: { descriptionEn: 'Changed' },
        }),
      );
      const excessiveCredit = await transaction.ledgerEntry.create({
        data: {
          organizationId: organization.id,
          billingAccountId: billing.id,
          direction: 'CREDIT',
          entryType: 'CREDIT_NOTE',
          amount: '101.00',
          sourceType: 'CREDIT_NOTE_TEST',
          sourceId: randomUUID(),
        },
      });
      await expectDatabaseRejection(transaction, () =>
        transaction.creditNote.create({
          data: {
            organizationId: organization.id,
            invoiceId: invoice.id,
            ledgerEntryId: excessiveCredit.id,
            fiscalYear: 2026,
            serialNumber: 1,
            amount: '101.00',
            reason: 'Excessive',
            issuedBy: randomUUID(),
          },
        }),
      );
    });
  });
});
