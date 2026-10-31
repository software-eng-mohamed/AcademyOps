import {
  baseRecord,
  branchId,
  cents,
  type DemoRecord,
  type DemoState,
  demoId,
  find,
  money,
  object,
  records,
  timestamp,
} from './shared';

export function financeFixtures(state: DemoState): Record<string, DemoRecord[]> {
  const methods = [
    baseRecord(demoId(2090), { code: 'CASH', name: 'Cash', isActive: true }),
    baseRecord(demoId(2091), { code: 'BANK_TRANSFER', name: 'Bank transfer', isActive: true }),
  ];
  const payments = records(state, 'enrollments').flatMap((enrollment, index) =>
    index % 4 === 3
      ? []
      : [
          baseRecord(demoId(2100 + index), {
            billingAccountId: enrollment.billingAccountId,
            enrollmentId: enrollment.id,
            amount: index % 4 === 2 ? '1500.00' : '3000.00',
            refundedAmount: '0.00',
            refundStatus: 'NONE',
            currencyCode: 'EGP',
            methodId: methods[0]?.id,
            method: methods[0],
            status: 'POSTED',
            externalReference: `DEMO-CASH-${index + 1}`,
            receivedAt: timestamp(-4),
            postedAt: timestamp(-4),
            receiptIssued: true,
            receipt: { id: demoId(2200 + index), serialNumber: `AO-R-${1001 + index}` },
            pendingApprovals: [],
            events: [],
            refunds: [],
            gatewayAttempts: [],
          }),
        ],
  );
  const receipts = payments.map((payment) =>
    baseRecord(String(object(payment.receipt).id), {
      paymentId: payment.id,
      billingAccountId: payment.billingAccountId,
      amount: payment.amount,
      currencyCode: 'EGP',
      serialNumber: object(payment.receipt).serialNumber,
      fiscalYear: new Date().getUTCFullYear(),
      issuedAt: timestamp(-4),
      payment,
      documentLabel: 'Synthetic payment receipt',
      payerSnapshot: {},
      createdBy: demoId(3),
    }),
  );
  const invoices = records(state, 'enrollments')
    .slice(0, 6)
    .map((enrollment, index) =>
      baseRecord(demoId(2300 + index), {
        billingAccountId: enrollment.billingAccountId,
        serialNumber: `AO-INV-${1001 + index}`,
        status: 'ISSUED',
        subtotal: '3000.00',
        taxAmount: '0.00',
        totalAmount: '3000.00',
        settledAmount: index % 4 === 3 ? '0.00' : index % 4 === 2 ? '1500.00' : '3000.00',
        creditedAmount: '0.00',
        paymentStatus: index % 4 === 3 ? 'UNPAID' : index % 4 === 2 ? 'PARTIALLY_PAID' : 'PAID',
        currencyCode: 'EGP',
        fiscalYear: new Date().getUTCFullYear(),
        issuedAt: timestamp(-10),
        voidedAt: null,
        createdBy: demoId(3),
        customerSnapshot: find(state, 'students', enrollment.studentPersonId) ?? {},
        creditNotes: [],
        lines: [
          {
            id: demoId(2350 + index),
            descriptionEn: 'Program tuition',
            descriptionAr: 'رسوم البرنامج',
            quantity: '1.00',
            unitAmount: '3000.00',
            lineTotal: '3000.00',
            taxAmount: '0.00',
            organizationId: demoId(1),
            invoiceId: demoId(2300 + index),
            ledgerEntryId: demoId(2700 + index),
            createdAt: timestamp(-10),
          },
        ],
      }),
    );
  return {
    paymentMethods: methods,
    payments,
    receipts,
    invoices,
    exports: [
      baseRecord(demoId(2400), {
        reportType: 'FINANCE_RECEIVABLES',
        status: 'COMPLETED',
        parameters: {},
        fileAssetId: null,
        errorMessage: null,
        startedAt: timestamp(),
        completedAt: timestamp(),
        expiresAt: timestamp(1),
      }),
    ],
    pricingAgreements: [],
    businessAccounts: [
      baseRecord(demoId(2500), {
        legalName: 'Future Skills Training Ltd',
        displayName: 'Future Skills',
        status: 'ACTIVE',
        owningBranchId: branchId,
        registrationNo: 'DEMO-10001',
        taxId: 'SYNTHETIC',
        billingAccount: { id: demoId(2501), currencyCode: 'EGP' },
        contacts: [],
      }),
    ],
    certificates: [],
    certificateRules: [],
  };
}

export function enrollmentFinance(state: DemoState, enrollment: DemoRecord) {
  const agreement = records(state, 'feeAgreements').find(
    (item) => item.enrollmentId === enrollment.id && item.status === 'APPROVED',
  );
  const total = cents(agreement?.totalAmount) ?? 0;
  const billingAccountId = enrollment.billingAccountId ?? object(enrollment.billingAccount).id;
  const paid = records(state, 'payments')
    .filter((item) => item.billingAccountId === billingAccountId && item.status === 'POSTED')
    .reduce(
      (sum, payment) => sum + (cents(payment.amount) ?? 0) - (cents(payment.refundedAmount) ?? 0),
      0,
    );
  const credits = records(state, 'creditNotes')
    .filter((note) => note.billingAccountId === billingAccountId)
    .reduce((sum, note) => sum + (cents(note.amount) ?? 0), 0);
  const amount = paid + credits;
  return {
    billingAccountId,
    enrollmentId: enrollment.studentPersonId ? enrollment.id : null,
    currencyCode: 'EGP',
    totalDebits: money(total),
    totalCredits: money(amount),
    balance: money(total - amount),
    outstandingDebits: money(Math.max(0, total - amount)),
    unappliedCredits: money(Math.max(0, amount - total)),
  };
}

export function aging(state: DemoState) {
  const rows = records(state, 'enrollments').flatMap((item, index) => {
    const balance = enrollmentFinance(state, item).outstandingDebits;
    return Number(balance) > 0
      ? [
          {
            installmentId: demoId(2600 + index),
            enrollmentId: item.id,
            dueDate: timestamp(index % 2 ? -12 : 7),
            ageDays: index % 2 ? 12 : 0,
            bucket: index % 2 ? '1_30' : 'CURRENT',
            outstanding: balance,
          },
        ]
      : [];
  });
  const totals = {
    CURRENT: '0.00',
    '1_30': '0.00',
    '31_60': '0.00',
    '61_90': '0.00',
    '91_PLUS': '0.00',
  };
  for (const row of rows) {
    const key = row.bucket as keyof typeof totals;
    totals[key] = money((cents(totals[key]) ?? 0) + (cents(row.outstanding) ?? 0));
  }
  return { asOf: timestamp(), currencyCode: 'EGP', totals, rows };
}

export function receivables(state: DemoState) {
  const entries = records(state, 'enrollments').map((item) => enrollmentFinance(state, item));
  return {
    asOf: timestamp(),
    branchId,
    currencyCode: 'EGP',
    enrollmentCount: entries.length,
    outstandingEnrollmentCount: entries.filter((item) => Number(item.balance) > 0).length,
    totals: {
      debits: money(entries.reduce((sum, item) => sum + (cents(item.totalDebits) ?? 0), 0)),
      allocated: money(entries.reduce((sum, item) => sum + (cents(item.totalCredits) ?? 0), 0)),
      outstanding: money(
        entries.reduce((sum, item) => sum + (cents(item.outstandingDebits) ?? 0), 0),
      ),
    },
  };
}

export function financeAccount(state: DemoState, id: string) {
  return (
    records(state, 'enrollments').find((item) => item.billingAccountId === id) ??
    records(state, 'businessAccounts').find((item) => object(item.billingAccount).id === id)
  );
}

export function paymentMethod(state: DemoState, id: unknown) {
  return find(state, 'paymentMethods', id);
}

export function invoiceView(state: DemoState, invoice: DemoRecord) {
  const account = financeAccount(state, String(invoice.billingAccountId));
  if (!account) return invoice;
  const total = cents(invoice.totalAmount) ?? 0;
  const notes = records(state, 'creditNotes').filter((note) => note.invoiceId === invoice.id);
  const credited = notes.reduce((sum, note) => sum + (cents(note.amount) ?? 0), 0);
  const paid = records(state, 'payments')
    .filter(
      (payment) =>
        payment.billingAccountId === invoice.billingAccountId && payment.status === 'POSTED',
    )
    .reduce(
      (sum, payment) => sum + (cents(payment.amount) ?? 0) - (cents(payment.refundedAmount) ?? 0),
      0,
    );
  const settled = Math.min(total, paid);
  return {
    ...invoice,
    creditedAmount: money(credited),
    creditNotes: notes,
    settledAmount: money(settled),
    paymentStatus:
      settled + credited >= total ? 'PAID' : settled + credited > 0 ? 'PARTIALLY_PAID' : 'UNPAID',
  };
}
