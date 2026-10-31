import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
@Injectable()
export class FinanceHelperService {
  async uniquePaymentReference(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    methodId: string,
    value: string | undefined,
  ): Promise<string | null> {
    if (!value?.trim()) return null;
    const reference = value.trim().toUpperCase();
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${organizationId} || ':' || ${methodId} || ':' || ${reference}, 0)
      )
    `;
    const rows = await transaction.$queryRaw<
      Array<{
        exists: boolean;
      }>
    >`
      SELECT EXISTS (
        SELECT 1 FROM payments
        WHERE organization_id = ${organizationId}::uuid
          AND method_id = ${methodId}::uuid
          AND upper(btrim(external_reference)) = ${reference}
      ) AS "exists"
    `;
    if (rows[0]?.exists) {
      throw new ConflictException({
        code: 'PAYMENT_REFERENCE_DUPLICATE',
        messageKey: 'finance.paymentReferenceDuplicate',
      });
    }
    return reference;
  }
  async nextDocumentNumber(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    fiscalYear: number,
    documentType: string,
  ): Promise<bigint> {
    const rows = await transaction.$queryRaw<
      Array<{
        serial_number: bigint;
      }>
    >`
      INSERT INTO document_sequences (id, organization_id, fiscal_year, document_type, next_value, updated_at)
      VALUES (gen_random_uuid(), ${organizationId}::uuid, ${fiscalYear}, ${documentType}, 2, now())
      ON CONFLICT (organization_id, fiscal_year, document_type)
      DO UPDATE SET next_value = document_sequences.next_value + 1, updated_at = now()
      RETURNING next_value - 1 AS serial_number
    `;
    const value = rows[0]?.serial_number;
    if (value === undefined) throw new Error('Document sequence did not return a value');
    return value;
  }
  async payerSnapshot(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    billingAccountId: string,
  ): Promise<Prisma.InputJsonValue> {
    const billing = await transaction.billingAccount.findFirstOrThrow({
      where: { id: billingAccountId, organizationId },
    });
    if (billing.kind === 'INDIVIDUAL' && billing.personId) {
      const person = await transaction.person.findFirstOrThrow({
        where: { id: billing.personId, organizationId },
      });
      return {
        kind: billing.kind,
        publicId: person.publicId,
        name: person.name,
      };
    }
    const business = await transaction.businessAccount.findFirstOrThrow({
      where: { id: billing.businessAccountId!, organizationId },
    });
    return {
      kind: billing.kind,
      displayName: business.displayName,
      legalName: business.legalName,
      taxId: business.taxId,
    };
  }
  async paymentResult(
    transaction: Prisma.TransactionClient,
    paymentId: string,
  ): Promise<{
    id: string;
    status: string;
    version: number;
    receiptSerial: string | null;
  }> {
    const payment = await transaction.payment.findUniqueOrThrow({ where: { id: paymentId } });
    const receipt = await transaction.internalReceipt.findFirst({
      where: { organizationId: payment.organizationId, paymentId },
    });
    return {
      id: payment.id,
      status: payment.status,
      version: payment.version,
      receiptSerial: receipt?.serialNumber.toString() ?? null,
    };
  }
  async lockPayment(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    paymentId: string,
  ): Promise<void> {
    await transaction.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
  }
  paymentNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'PAYMENT_NOT_FOUND',
      messageKey: 'finance.paymentNotFound',
    });
  }
  invoiceResult(invoice: {
    id: string;
    status: string;
    serialNumber: bigint | null;
    version: number;
  }): {
    id: string;
    status: string;
    serialNumber: string | null;
    version: number;
  } {
    return {
      id: invoice.id,
      status: invoice.status,
      serialNumber: invoice.serialNumber?.toString() ?? null,
      version: invoice.version,
    };
  }
  invoiceNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'INVOICE_NOT_FOUND',
      messageKey: 'finance.invoiceNotFound',
    });
  }
}
