import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/** Historical adjustments need reconciliation before their credit can be spent again. */
export async function assertCreditAdjustmentsSettled(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  creditEntryId: string,
): Promise<void> {
  const unresolved = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT adjustment.id FROM ledger_entries adjustment
    WHERE adjustment.organization_id = ${organizationId}::uuid
      AND adjustment.direction = 'DEBIT'
      AND (
        (adjustment.entry_type = 'PAYMENT_REVERSAL' AND adjustment.reversal_of_id = ${creditEntryId}::uuid)
        OR (adjustment.entry_type = 'REFUND' AND EXISTS (
          SELECT 1 FROM refunds r JOIN payments p
            ON p.organization_id = r.organization_id AND p.id = r.payment_id
          WHERE r.organization_id = adjustment.organization_id
            AND r.ledger_entry_id = adjustment.id AND p.ledger_entry_id = ${creditEntryId}::uuid
        ))
      )
      AND adjustment.amount <> COALESCE((
        SELECT SUM(a.amount) FROM ledger_allocations a
        WHERE a.organization_id = adjustment.organization_id AND a.debit_entry_id = adjustment.id
      ), 0)
    LIMIT 1
  `;
  if (unresolved.length) {
    throw new ConflictException({
      code: 'FINANCE_ALLOCATION_RECONCILIATION_REQUIRED',
      messageKey: 'finance.allocationReconciliationRequired',
    });
  }
}
