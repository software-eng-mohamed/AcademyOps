import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { OutboxService } from '../platform/outbox/outbox.service';
import { FinanceHelperService } from './finance-helper.service';
import { allocateCreditToDebits, lockBillingAccount } from './finance-allocation-settlement';

@Injectable()
export class FinanceLedgerService {
  constructor(
    private readonly outbox: OutboxService,
    private readonly helper: FinanceHelperService,
  ) {}

  async postPaymentLedger(
    transaction: Prisma.TransactionClient,
    access: AccessContext,
    paymentId: string,
    preferredInstallmentId?: string,
  ): Promise<void> {
    const payment = await transaction.payment.findFirstOrThrow({
      where: { id: paymentId, organizationId: access.organizationId },
    });
    await lockBillingAccount(transaction, access.organizationId, payment.billingAccountId);
    let ledgerEntryId = payment.ledgerEntryId;
    if (!ledgerEntryId) {
      const entry = await transaction.ledgerEntry.create({
        data: {
          organizationId: access.organizationId,
          billingAccountId: payment.billingAccountId,
          enrollmentId: payment.enrollmentId,
          direction: 'CREDIT',
          entryType: 'PAYMENT',
          amount: payment.amount,
          sourceType: 'PAYMENT',
          sourceId: payment.id,
        },
      });
      ledgerEntryId = entry.id;
      await transaction.payment.update({ where: { id: payment.id }, data: { ledgerEntryId } });
      let remaining = payment.amount;
      if (preferredInstallmentId) {
        const installment = await transaction.installment.findFirst({
          where: {
            id: preferredInstallmentId,
            organizationId: access.organizationId,
            debitEntryId: { not: null },
          },
        });
        if (!installment?.debitEntryId) {
          throw new ConflictException({
            code: 'INSTALLMENT_NOT_ACTIVATED',
            messageKey: 'finance.installmentNotActivated',
          });
        }
        const debit = await transaction.ledgerEntry.findFirst({
          where: {
            id: installment.debitEntryId,
            organizationId: access.organizationId,
            billingAccountId: payment.billingAccountId,
            enrollmentId: payment.enrollmentId,
            direction: 'DEBIT',
          },
        });
        if (!debit) {
          throw new ConflictException({
            code: 'INSTALLMENT_LEDGER_MISMATCH',
            messageKey: 'finance.installmentLedgerMismatch',
          });
        }
        await this.allocateCreditAgainstDebits(transaction, access, entry.id, remaining, [debit]);
        const allocated = await transaction.ledgerAllocation.aggregate({
          where: { organizationId: access.organizationId, creditEntryId: entry.id },
          _sum: { amount: true },
        });
        remaining = payment.amount.sub(allocated._sum.amount ?? 0);
      }
      if (remaining.gt(0)) {
        await this.allocateOldestDebits(
          transaction,
          access,
          entry.id,
          remaining,
          payment.billingAccountId,
          payment.enrollmentId,
        );
      }
    }
    const receipt = await transaction.internalReceipt.findFirst({
      where: { organizationId: access.organizationId, paymentId: payment.id },
    });
    if (!receipt) {
      const fiscalYear = payment.receivedAt.getUTCFullYear();
      const serial = await this.helper.nextDocumentNumber(
        transaction,
        access.organizationId,
        fiscalYear,
        'RECEIPT',
      );
      await transaction.internalReceipt.create({
        data: {
          organizationId: access.organizationId,
          paymentId: payment.id,
          billingAccountId: payment.billingAccountId,
          fiscalYear,
          serialNumber: serial,
          amount: payment.amount,
          payerSnapshot: await this.helper.payerSnapshot(
            transaction,
            access.organizationId,
            payment.billingAccountId,
          ),
          createdBy: access.actorUserId,
        },
      });
      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'Payment',
        aggregateId: payment.id,
        type: 'receipt.issued',
        payload: { paymentId: payment.id, fiscalYear, serialNumber: serial.toString() },
      });
    }
  }

  async allocateOldestDebits(
    transaction: Prisma.TransactionClient,
    access: AccessContext,
    creditEntryId: string,
    creditAmount: Prisma.Decimal,
    billingAccountId: string,
    enrollmentId: string | null,
  ): Promise<void> {
    const debits = await transaction.ledgerEntry.findMany({
      where: {
        organizationId: access.organizationId,
        billingAccountId,
        direction: 'DEBIT',
        entryType: { notIn: ['REFUND', 'PAYMENT_REVERSAL'] },
        ...(enrollmentId ? { OR: [{ enrollmentId }, { enrollmentId: null }] } : {}),
      },
      orderBy: [{ postedAt: 'asc' }, { id: 'asc' }],
    });
    await allocateCreditToDebits(transaction, access, creditEntryId, creditAmount, debits);
  }

  async allocateCreditAgainstDebits(
    transaction: Prisma.TransactionClient,
    access: AccessContext,
    creditEntryId: string,
    creditAmount: Prisma.Decimal,
    debits: Array<{ id: string; amount: Prisma.Decimal }>,
  ): Promise<void> {
    await allocateCreditToDebits(transaction, access, creditEntryId, creditAmount, debits);
  }
}
