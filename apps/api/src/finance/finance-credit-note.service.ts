import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AccessContext } from '@academyops/contracts';
import { AuditService } from '../platform/audit/audit.service';
import { PrismaService } from '../platform/database/prisma.service';
import { OutboxService } from '../platform/outbox/outbox.service';
import { IdempotencyService } from '../platform/idempotency/idempotency.service';
import { FinanceAccessService } from './finance-access.service';
import { FinanceHelperService } from './finance-helper.service';
import { FinanceLedgerService } from './finance-ledger.service';

type MutationMeta = { correlationId: string; idempotencyKey: string };
type CreditNoteResult = { id: string; serialNumber: string; amount: string };

@Injectable()
export class FinanceCreditNoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly idempotency: IdempotencyService,
    private readonly financeAccess: FinanceAccessService,
    private readonly helper: FinanceHelperService,
    private readonly ledger: FinanceLedgerService,
  ) {}

  async createCreditNote(
    access: AccessContext,
    invoiceId: string,
    amount: string,
    reason: string,
    meta: MutationMeta,
  ): Promise<CreditNoteResult> {
    return this.prisma.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM internal_invoices WHERE id = ${invoiceId}::uuid AND organization_id = ${access.organizationId}::uuid FOR UPDATE`;
      const invoice = await transaction.internalInvoice.findFirst({
        where: { id: invoiceId, organizationId: access.organizationId },
      });
      if (!invoice) throw this.helper.invoiceNotFound();
      await this.financeAccess.assertBillingAccount(
        transaction,
        access,
        'invoices.issue',
        invoice.billingAccountId,
      );
      const attempt = await this.idempotency.begin<CreditNoteResult>(
        transaction,
        access.organizationId,
        'credit_note.issue',
        meta.idempotencyKey,
        { invoiceId, amount, reason },
      );
      if (attempt.replayed) return attempt.response;
      if (invoice.status !== 'ISSUED') {
        throw new ConflictException({
          code: 'CREDIT_NOTE_INVOICE_INVALID',
          messageKey: 'finance.creditNoteInvoiceInvalid',
        });
      }
      const noteAmount = new Prisma.Decimal(amount);
      if (noteAmount.lte(0)) {
        throw new ConflictException({
          code: 'CREDIT_NOTE_AMOUNT_INVALID',
          messageKey: 'finance.creditNoteAmountInvalid',
        });
      }
      const existingNotes = await transaction.creditNote.findMany({
        where: { organizationId: access.organizationId, invoiceId },
      });
      const credited = existingNotes.reduce(
        (sum, note) => sum.add(note.amount),
        new Prisma.Decimal(0),
      );
      if (credited.add(noteAmount).gt(invoice.totalAmount)) {
        throw new ConflictException({
          code: 'CREDIT_NOTE_EXCEEDS_INVOICE',
          messageKey: 'finance.creditNoteExceedsInvoice',
        });
      }
      const lines = await transaction.invoiceLine.findMany({
        where: { organizationId: access.organizationId, invoiceId },
        select: { ledgerEntryId: true },
      });
      const debitIds = lines.flatMap((line) => (line.ledgerEntryId ? [line.ledgerEntryId] : []));
      if (debitIds.length === 0) {
        throw new ConflictException({
          code: 'CREDIT_NOTE_DEBITS_MISSING',
          messageKey: 'finance.creditNoteDebitsMissing',
        });
      }
      const debitEntries = await transaction.ledgerEntry.findMany({
        where: { organizationId: access.organizationId, id: { in: debitIds } },
        orderBy: [{ postedAt: 'asc' }, { id: 'asc' }],
      });
      const enrollmentIds = new Set(
        debitEntries.flatMap((entry) => (entry.enrollmentId ? [entry.enrollmentId] : [])),
      );
      const singleEnrollmentId =
        enrollmentIds.size === 1 ? (enrollmentIds.values().next().value ?? null) : null;
      const creditNoteId = randomUUID();
      const entry = await transaction.ledgerEntry.create({
        data: {
          organizationId: access.organizationId,
          billingAccountId: invoice.billingAccountId,
          enrollmentId: singleEnrollmentId,
          direction: 'CREDIT',
          entryType: 'CREDIT_NOTE',
          amount: noteAmount,
          sourceType: 'CREDIT_NOTE',
          sourceId: creditNoteId,
          description: reason,
        },
      });
      const fiscalYear = new Date().getUTCFullYear();
      const serial = await this.helper.nextDocumentNumber(
        transaction,
        access.organizationId,
        fiscalYear,
        'CREDIT_NOTE',
      );
      const note = await transaction.creditNote.create({
        data: {
          id: creditNoteId,
          organizationId: access.organizationId,
          invoiceId,
          ledgerEntryId: entry.id,
          fiscalYear,
          serialNumber: serial,
          amount: noteAmount,
          reason,
          issuedBy: access.actorUserId,
        },
      });
      await this.ledger.allocateCreditAgainstDebits(
        transaction,
        access,
        entry.id,
        noteAmount,
        debitEntries,
      );
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'credit_note.issue',
        entityType: 'CreditNote',
        entityId: note.id,
        correlationId: meta.correlationId,
        after: { invoiceId, amount: amount, reason },
      });
      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'CreditNote',
        aggregateId: note.id,
        type: 'credit_note.issued',
        payload: { creditNoteId: note.id, invoiceId, serialNumber: serial.toString() },
      });
      const result = {
        id: note.id,
        serialNumber: serial.toString(),
        amount: note.amount.toFixed(2),
      };
      await this.idempotency.complete(transaction, attempt.recordId, 201, result);
      return result;
    });
  }
}
