import { paymentView } from './finance-adjustments';
import {
  aging,
  enrollmentFinance,
  financeAccount,
  invoiceView,
  paymentMethod,
  receivables,
} from './finance-fixtures';
import {
  audit,
  baseRecord,
  bump,
  cents,
  type DemoContext,
  demoId,
  failure,
  find,
  invalid,
  json,
  money,
  nextId,
  notFound,
  page,
  records,
  required,
  string,
  timestamp,
  unsupported,
  versionConflict,
} from './shared';

export function handleFinanceRoute(ctx: DemoContext): Response | null {
  const { state, path, method, body, url } = ctx;
  if (path[0] === 'payment-methods' && method === 'GET')
    return json(records(state, 'paymentMethods'));
  if (path[0] === 'finance' && path[2] === 'aging' && method === 'GET') return json(aging(state));
  if (path[0] === 'enrollments' && path[2] === 'finance-summary' && method === 'GET') {
    const item = find(state, 'enrollments', path[1]);
    return item ? json(enrollmentFinance(state, item)) : notFound();
  }
  if (path[0] === 'billing-accounts' && path[2] === 'finance-summary' && method === 'GET') {
    const item = financeAccount(state, path[1] ?? '');
    return item ? json(enrollmentFinance(state, item)) : notFound();
  }
  if (path[0] === 'enrollments' && path[2] === 'installments' && method === 'GET') {
    const item = find(state, 'enrollments', path[1]);
    if (!item) return notFound();
    const finance = enrollmentFinance(state, item);
    return json({
      items: [
        {
          id: `installment-${item.id}`,
          ordinal: 1,
          dueDate: timestamp(7),
          originalAmount: finance.totalDebits,
          allocatedAmount: finance.totalCredits,
          outstandingAmount: finance.outstandingDebits,
          state:
            Number(finance.balance) > 0
              ? Number(finance.totalCredits) > 0
                ? 'PARTIALLY_PAID'
                : 'UPCOMING'
              : 'PAID',
          currency: 'EGP',
          payable: false,
        },
      ],
      nextCursor: null,
    });
  }
  if (path[0] === 'payments') {
    if (method === 'GET' && path.length === 1)
      return page(
        records(state, 'payments').map((item) => paymentView(state, item)),
        url,
      );
    if (method === 'POST' && path.length === 1) {
      const amount = cents(body.amount);
      const account = financeAccount(state, string(body.billingAccountId));
      const enrollment = body.enrollmentId
        ? find(state, 'enrollments', body.enrollmentId)
        : undefined;
      const paymentMethodItem = paymentMethod(state, body.methodId);
      if (
        !account ||
        !paymentMethodItem ||
        amount === null ||
        amount <= 0 ||
        !Number.isFinite(Date.parse(string(body.receivedAt))) ||
        (body.enrollmentId &&
          (!enrollment || enrollment.billingAccountId !== body.billingAccountId))
      )
        return invalid();
      if (
        enrollment &&
        amount > (cents(enrollmentFinance(state, enrollment).outstandingDebits) ?? 0)
      )
        return failure('PAYMENT_EXCEEDS_BALANCE', 409);
      const item = baseRecord(nextId(state), {
        billingAccountId: body.billingAccountId,
        enrollmentId: body.enrollmentId ?? null,
        amount: money(amount),
        currencyCode: 'EGP',
        methodId: paymentMethodItem.id,
        method: paymentMethodItem,
        receivedAt: body.receivedAt,
        postedAt: null,
        externalReference: string(body.externalReference) || null,
        status: 'PENDING_VERIFICATION',
        refundedAmount: '0.00',
        refundStatus: 'NONE',
        receiptIssued: false,
        receipt: null,
        pendingApprovals: [],
        events: [],
        refunds: [],
        gatewayAttempts: [],
      });
      records(state, 'payments').unshift(item);
      audit(state, 'payment.recorded', item, 'PAYMENT');
      return json(item, 201);
    }
    const item = find(state, 'payments', path[1]);
    if (!item) return notFound();
    if (method === 'GET' && path.length === 2) return json(paymentView(state, item));
    if (method !== 'POST') return unsupported();
    const conflict = versionConflict(ctx, item);
    if (conflict) return conflict;
    if (path[2] === 'post' || path[2] === 'reject') {
      if (
        item.status !== 'PENDING_VERIFICATION' ||
        (path[2] === 'reject' && !required(body.reason, 500))
      )
        return invalid();
      const enrollment = find(state, 'enrollments', item.enrollmentId);
      if (
        path[2] === 'post' &&
        enrollment &&
        (cents(item.amount) ?? 0) >
          (cents(enrollmentFinance(state, enrollment).outstandingDebits) ?? 0)
      )
        return failure('PAYMENT_EXCEEDS_BALANCE', 409);
      bump(item, {
        status: path[2] === 'post' ? 'POSTED' : 'REJECTED',
        postedAt: path[2] === 'post' ? timestamp() : null,
      });
      audit(state, `payment.${path[2]}`, item, 'PAYMENT');
      return json(item, 201);
    }
    if (path[2] === 'receipt') {
      if (item.status !== 'POSTED') return invalid();
      const existing = records(state, 'receipts').find((receipt) => receipt.paymentId === item.id);
      if (existing) return json(existing, 201);
      const receipt = baseRecord(nextId(state), {
        paymentId: item.id,
        billingAccountId: item.billingAccountId,
        amount: item.amount,
        currencyCode: 'EGP',
        serialNumber: `AO-R-${state.sequence}`,
        issuedAt: timestamp(),
        fiscalYear: new Date().getUTCFullYear(),
        payerSnapshot: {},
        documentLabel: 'Synthetic payment receipt',
        createdBy: demoId(3),
      });
      records(state, 'receipts').unshift(receipt);
      bump(item, { receiptIssued: true, receipt });
      return json(receipt, 201);
    }
    return unsupported();
  }
  if (['invoices', 'receipts'].includes(path[0] ?? '')) {
    const collection = path[0] ?? '';
    if (method === 'GET' && path.length === 1)
      return page(
        records(state, collection).map((item) =>
          collection === 'invoices' ? invoiceView(state, item) : item,
        ),
        url,
      );
    if (method === 'GET' && path.length === 2) {
      const item = find(state, collection, path[1]);
      return item ? json(collection === 'invoices' ? invoiceView(state, item) : item) : notFound();
    }
    return unsupported();
  }
  if (path[0] === 'business-accounts') {
    if (method === 'GET' && path.length === 1) return page(records(state, 'businessAccounts'), url);
    if (method === 'GET' && path[1] === 'contact-candidates')
      return page(records(state, 'students'), url);
    if (method === 'POST' && path.length === 1) {
      if (
        !required(body.legalName) ||
        !required(body.displayName) ||
        !find(state, 'branches', body.owningBranchId)
      )
        return invalid();
      const item = baseRecord(nextId(state), {
        legalName: body.legalName,
        displayName: body.displayName,
        owningBranchId: body.owningBranchId,
        status: 'ACTIVE',
        registrationNo: string(body.registrationNo),
        taxId: string(body.taxId),
        contacts: [],
        billingAccount: { id: nextId(state), currencyCode: 'EGP' },
      });
      records(state, 'businessAccounts').push(item);
      return json(item, 201);
    }
    const item = find(state, 'businessAccounts', path[1]);
    if (!item) return notFound();
    if (method === 'GET') return json(item);
    if (method === 'PATCH') {
      const conflict = versionConflict(ctx, item);
      if (conflict) return conflict;
      if (
        !required(body.legalName) ||
        !required(body.displayName) ||
        !['ACTIVE', 'ARCHIVED'].includes(string(body.status))
      )
        return invalid();
      return json(
        bump(item, {
          legalName: body.legalName,
          displayName: body.displayName,
          status: body.status,
          taxId: string(body.taxId),
          registrationNo: string(body.registrationNo),
        }),
      );
    }
    return unsupported();
  }
  if (path[0] === 'reports' && path[1] === 'finance' && path[2] === 'receivables') {
    if (method === 'GET') return json(receivables(state));
    if (method === 'POST' && path[3] === 'exports') {
      const item = baseRecord(nextId(state), {
        reportType: 'FINANCE_RECEIVABLES',
        status: 'COMPLETED',
        parameters: {},
        fileAssetId: null,
        errorMessage: null,
        startedAt: timestamp(),
        completedAt: timestamp(),
        expiresAt: timestamp(1),
      });
      records(state, 'exports').unshift(item);
      return json(item, 201);
    }
  }
  if (path[0] === 'reports' && path[1] === 'exports' && method === 'GET') {
    if (path.length === 2) return page(records(state, 'exports'), url);
    const item = find(state, 'exports', path[2]);
    if (!item) return notFound();
    if (path[3] === 'download')
      return json({ url: `${url.origin}/api/v1/demo/exports/${item.id}`, expiresAt: timestamp(1) });
  }
  if (path[0] === 'demo' && path[1] === 'exports' && method === 'GET') {
    if (!find(state, 'exports', path[2])) return notFound();
    const rows = records(state, 'enrollments').map(
      (item) =>
        `${item.id},${string(find(state, 'students', item.studentPersonId)?.publicId)},${enrollmentFinance(state, item).outstandingDebits}`,
    );
    return new Response(
      `Synthetic demo data only\nEnrollment,Student,Outstanding EGP\n${rows.join('\n')}\n`,
      {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="academyops-demo-receivables.csv"',
          'Cache-Control': 'no-store',
        },
      },
    );
  }
  if (path[0] === 'pricing-agreements' && method === 'GET') {
    if (path.length === 1)
      return page(
        records(state, 'feeAgreements').filter(
          (item) =>
            !url.searchParams.get('enrollmentId') ||
            item.enrollmentId === url.searchParams.get('enrollmentId'),
        ),
        url,
      );
    const item = find(state, 'feeAgreements', path[1]);
    return item ? json(item) : notFound();
  }
  return null;
}
