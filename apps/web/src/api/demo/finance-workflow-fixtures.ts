import { baseRecord, type DemoRecord, type DemoState, demoId, records, timestamp } from './shared';

export function financeWorkflowFixtures(state: DemoState): Record<string, DemoRecord[]> {
  return {
    ledgerEntries: records(state, 'enrollments').map((enrollment, index) =>
      baseRecord(demoId(2700 + index), {
        enrollmentId: enrollment.id,
        billingAccountId: enrollment.billingAccountId,
        direction: 'DEBIT',
        entryType: 'TUITION',
        description: 'Synthetic course tuition',
        amount: '3000.00',
        currencyCode: 'EGP',
        postedAt: timestamp(-25),
      }),
    ),
    creditNotes: [],
    refundRequests: [
      baseRecord(demoId(2800), {
        paymentId: demoId(2100),
        kind: 'REFUND',
        requestedAmount: '250.00',
        status: 'REQUESTED',
        reason: 'Synthetic partial refund for review',
        requestedBy: demoId(3001),
        approvedBy: null,
      }),
    ],
    reversalRequests: [
      baseRecord(demoId(2801), {
        paymentId: demoId(2101),
        kind: 'REVERSAL',
        requestedAmount: null,
        status: 'REQUESTED',
        reason: 'Synthetic duplicate entry for review',
        requestedBy: demoId(3001),
        approvedBy: null,
      }),
    ],
  };
}
