import { assertCompatiblePayment } from './import-payment-compatibility';
import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { codeFrom, type MasterValue } from './import-values';
type FinanceRow = {
  id: string;
  rowHash: string;
};
@Injectable()
export class ImportFinanceWriter {
  async write(
    db: Prisma.TransactionClient,
    access: AccessContext,
    row: FinanceRow,
    enrollmentId: string,
    billingAccountId: string,
    value: MasterValue,
  ): Promise<void> {
    if (value.totalAmount <= 0) {
      if (value.paidAmount > 0 || value.payments.length > 0)
        throw new ConflictException({
          code: 'PRICING_TOTAL_MISSING_WITH_PAYMENT',
          messageKey: 'imports.pricing_total_missing_with_payment',
        });
      return;
    }
    const agreement = await this.ensureAgreement(db, access, enrollmentId, value);
    const debit = await this.ensureScheduleAndDebit(
      db,
      access,
      enrollmentId,
      billingAccountId,
      agreement.id,
      value,
    );
    let sourceAllocated = 0;
    for (let index = 0; index < value.payments.length; index += 1) {
      const paymentValue = value.payments[index]!;
      const sourceOrdinal = paymentValue.sourceOrdinal ?? index + 1;
      const expectedAllocation = Math.min(
        paymentValue.amount,
        Math.max(0, value.totalAmount - sourceAllocated),
      );
      sourceAllocated += expectedAllocation;
      const key = `legacy-payment:${value.legacyCode}:${value.cohortCode}:${sourceOrdinal}`.slice(
        0,
        128,
      );
      const method = await this.paymentMethod(db, access.organizationId, paymentValue.method);
      let payment = await db.payment.findFirst({
        where: { organizationId: access.organizationId, idempotencyKey: key },
      });
      if (!payment) {
        const paymentId = randomUUID();
        const credit = await db.ledgerEntry.create({
          data: {
            organizationId: access.organizationId,
            billingAccountId,
            enrollmentId,
            direction: 'CREDIT',
            entryType: 'PAYMENT',
            amount: paymentValue.amount,
            sourceType: 'LEGACY_IMPORT_PAYMENT',
            sourceId: paymentId,
            description: `Imported ${paymentValue.method}`,
          },
        });
        payment = await db.payment.create({
          data: {
            id: paymentId,
            organizationId: access.organizationId,
            billingAccountId,
            enrollmentId,
            ledgerEntryId: credit.id,
            methodId: method.id,
            status: 'POSTED',
            amount: paymentValue.amount,
            externalReference: `LEGACY-${row.rowHash.slice(0, 12)}-${sourceOrdinal}`,
            idempotencyKey: key,
            receivedAt: new Date(paymentValue.receivedAt),
            postedAt: new Date(paymentValue.receivedAt),
            createdBy: access.actorUserId,
          },
        });
        await db.paymentEvent.create({
          data: {
            organizationId: access.organizationId,
            paymentId: payment.id,
            toStatus: 'POSTED',
            reason: 'Legacy workbook import',
            actorUserId: access.actorUserId,
            occurredAt: new Date(paymentValue.receivedAt),
          },
        });
        if (expectedAllocation > 0) {
          await db.ledgerAllocation.create({
            data: {
              organizationId: access.organizationId,
              creditEntryId: credit.id,
              debitEntryId: debit.id,
              amount: expectedAllocation,
              createdBy: access.actorUserId,
            },
          });
        }
      } else {
        await assertCompatiblePayment(
          db,
          access.organizationId,
          enrollmentId,
          billingAccountId,
          debit.id,
          payment,
          method.id,
          paymentValue.amount,
          paymentValue.receivedAt,
          expectedAllocation,
        );
      }
      await this.reference(db, access.organizationId, row.id, payment.id, `${sourceOrdinal}`);
    }
  }
  private async ensureAgreement(
    db: Prisma.TransactionClient,
    access: AccessContext,
    enrollmentId: string,
    value: MasterValue,
  ) {
    let agreement = await db.pricingAgreement.findFirst({
      where: { organizationId: access.organizationId, enrollmentId, status: 'APPROVED' },
    });
    if (agreement) return agreement;
    const latest = await db.pricingAgreement.findFirst({
      where: { organizationId: access.organizationId, enrollmentId },
      orderBy: { version: 'desc' },
    });
    agreement = await db.pricingAgreement.create({
      data: {
        organizationId: access.organizationId,
        enrollmentId,
        version: (latest?.version ?? 0) + 1,
        subtotal: value.subtotal,
        discountAmount: value.discountAmount,
        totalAmount: value.totalAmount,
        proposedBy: access.actorUserId,
        status: 'DRAFT',
      },
    });
    await db.pricingAgreementLine.create({
      data: {
        organizationId: access.organizationId,
        pricingAgreementId: agreement.id,
        type: 'TUITION',
        descriptionAr: 'Imported tuition',
        descriptionEn: 'Imported tuition',
        quantity: 1,
        unitAmount: value.subtotal,
        lineAmount: value.subtotal,
      },
    });
    await db.pricingAgreement.update({
      where: { id: agreement.id },
      data: { status: 'PROPOSED' },
    });
    return db.pricingAgreement.update({
      where: { id: agreement.id },
      data: { status: 'APPROVED', approvedBy: access.actorUserId, approvedAt: new Date() },
    });
  }
  private async ensureScheduleAndDebit(
    db: Prisma.TransactionClient,
    access: AccessContext,
    enrollmentId: string,
    billingAccountId: string,
    agreementId: string,
    value: MasterValue,
  ) {
    const existingDebit = await db.ledgerEntry.findFirst({
      where: {
        organizationId: access.organizationId,
        enrollmentId,
        direction: 'DEBIT',
        sourceType: 'LEGACY_IMPORT_CHARGE',
      },
    });
    if (existingDebit) return existingDebit;
    const schedule = await db.installmentSchedule.create({
      data: {
        organizationId: access.organizationId,
        enrollmentId,
        pricingAgreementId: agreementId,
        version: 1,
        status: 'DRAFT',
      },
    });
    const installment = await db.installment.create({
      data: {
        organizationId: access.organizationId,
        scheduleId: schedule.id,
        ordinal: 1,
        dueDate: value.payments[0] ? new Date(value.payments[0].receivedAt) : new Date(),
        amount: value.totalAmount,
      },
    });
    await db.installmentSchedule.update({
      where: { id: schedule.id },
      data: { status: 'APPROVED', approvedBy: access.actorUserId, approvedAt: new Date() },
    });
    const debit = await db.ledgerEntry.create({
      data: {
        organizationId: access.organizationId,
        billingAccountId,
        enrollmentId,
        direction: 'DEBIT',
        entryType: 'TUITION_CHARGE',
        amount: value.totalAmount,
        sourceType: 'LEGACY_IMPORT_CHARGE',
        sourceId: enrollmentId,
        description: `Imported charge ${value.legacyCode}`,
      },
    });
    await db.installment.update({
      where: { id: installment.id },
      data: { debitEntryId: debit.id },
    });
    return debit;
  }
  private async paymentMethod(
    db: Prisma.TransactionClient,
    organizationId: string,
    rawMethod: string,
  ) {
    const code = `LEGACY_${codeFrom(rawMethod, 'UNKNOWN')}`.slice(0, 50);
    return db.paymentMethod.upsert({
      where: { organizationId_code: { organizationId, code } },
      update: {},
      create: {
        organizationId,
        code,
        name: rawMethod,
        verificationRequired: false,
      },
    });
  }
  private async reference(
    db: Prisma.TransactionClient,
    organizationId: string,
    importRowId: string,
    entityId: string,
    rawValue: string,
  ): Promise<void> {
    const where = {
      organizationId,
      importRowId,
      entityType: 'PAYMENT',
      entityId,
      sourceField: 'PAYMENT',
      rawValue,
    };
    if (!(await db.legacyReference.findFirst({ where }))) {
      await db.legacyReference.create({ data: where });
    }
  }
}
