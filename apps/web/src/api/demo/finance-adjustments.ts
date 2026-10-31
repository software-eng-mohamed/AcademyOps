import {
  audit,
  baseRecord,
  bump,
  cents,
  type DemoContext,
  type DemoRecord,
  type DemoState,
  failure,
  find,
  invalid,
  json,
  money,
  nextId,
  notFound,
  ownerId,
  records,
  required,
  string,
  timestamp,
} from './shared';

export function paymentView(state: DemoState, payment: DemoRecord) {
  return {
    ...payment,
    pendingApprovals: ['refundRequests', 'reversalRequests'].flatMap((collection) =>
      records(state, collection).filter(
        (request) => request.paymentId === payment.id && request.status === 'REQUESTED',
      ),
    ),
  };
}
function pending(state: DemoState, paymentId: string, collection: string) {
  return records(state, collection).filter(
    (request) => request.paymentId === paymentId && request.status === 'REQUESTED',
  );
}
export function handleFinanceAdjustments(ctx: DemoContext): Response | null {
  const { state, method, path, body } = ctx;
  if (method !== 'POST') return null;
  const refund = path[2] === 'refund-requests' || path[0] === 'refund-requests';
  const reversal = path[2] === 'reversal-requests' || path[0] === 'payment-reversal-requests';
  if (!refund && !reversal) return null;
  const collection = refund ? 'refundRequests' : 'reversalRequests';
  if (path[0] === 'payments') {
    const payment = find(state, 'payments', path[1]);
    if (!payment) return notFound();
    if (payment.status !== 'POSTED' || !required(body.reason, 500)) return invalid();
    if (
      pending(state, payment.id, 'reversalRequests').length ||
      (!refund && pending(state, payment.id, 'refundRequests').length)
    )
      return failure('FINANCIAL_REQUEST_PENDING', 409);
    const amount = refund ? cents(body.amount) : null;
    const available = (cents(payment.amount) ?? 0) - (cents(payment.refundedAmount) ?? 0);
    const reserved = pending(state, payment.id, 'refundRequests').reduce(
      (sum, request) => sum + (cents(request.requestedAmount) ?? 0),
      0,
    );
    if (
      (refund && (amount === null || amount <= 0 || amount + reserved > available)) ||
      (!refund && Number(payment.refundedAmount) > 0)
    )
      return invalid();
    const request = baseRecord(nextId(state), {
      paymentId: payment.id,
      kind: refund ? 'REFUND' : 'REVERSAL',
      requestedAmount: amount === null ? null : money(amount),
      status: 'REQUESTED',
      reason: body.reason,
      requestedBy: ownerId,
      approvedBy: null,
    });
    records(state, collection).push(request);
    audit(
      state,
      `${refund ? 'refund' : 'payment.reversal'}.request`,
      request,
      refund ? 'REFUND_REQUEST' : 'PAYMENT_REVERSAL_REQUEST',
    );
    return json({ id: request.id, status: request.status }, 201);
  }
  const request = find(state, collection, path[1]);
  if (!request) return notFound();
  const payment = find(state, 'payments', request.paymentId);
  if (!payment) return notFound();
  const decision = path[2];
  if (!['approve', 'reject', 'withdraw'].includes(decision ?? '') || request.status !== 'REQUESTED')
    return invalid();
  const own = request.requestedBy === ownerId;
  if ((decision === 'withdraw' && !own) || (decision !== 'withdraw' && own))
    return failure('MAKER_CHECKER_REQUIRED', 409, 'finance.makerCheckerRequired');
  if (decision !== 'approve' && !required(body.reason, 500)) return invalid();
  if (decision === 'approve') {
    if (payment.status !== 'POSTED') return invalid();
    if (refund) {
      const amount = cents(request.requestedAmount) ?? 0;
      const refunded = (cents(payment.refundedAmount) ?? 0) + amount;
      if (
        refunded > (cents(payment.amount) ?? 0) ||
        pending(state, payment.id, 'reversalRequests').length
      )
        return invalid();
      const refundRecord = baseRecord(nextId(state), {
        refundRequestId: request.id,
        paymentId: payment.id,
        amount: money(amount),
        processedAt: timestamp(),
        reason: request.reason,
      });
      bump(payment, {
        refundedAmount: money(refunded),
        refundStatus: refunded === cents(payment.amount) ? 'FULL' : 'PARTIAL',
        refunds: [...(Array.isArray(payment.refunds) ? payment.refunds : []), refundRecord],
      });
      bump(request, { status: 'APPROVED', approvedBy: ownerId, decidedAt: timestamp() });
      audit(state, 'refund.approve', request, 'REFUND_REQUEST');
      return json({ id: refundRecord.id, amount: refundRecord.amount }, 201);
    }
    if (Number(payment.refundedAmount) > 0 || pending(state, payment.id, 'refundRequests').length)
      return invalid();
    bump(payment, { status: 'REVERSED' });
  }
  bump(request, {
    status: decision === 'approve' ? 'APPROVED' : decision === 'reject' ? 'REJECTED' : 'WITHDRAWN',
    approvedBy: decision === 'approve' ? ownerId : null,
    decisionReason: string(body.reason),
    decidedAt: timestamp(),
  });
  audit(
    state,
    `${refund ? 'refund' : 'payment.reversal'}.${decision}`,
    request,
    refund ? 'REFUND_REQUEST' : 'PAYMENT_REVERSAL_REQUEST',
  );
  return json({ id: request.id, status: request.status, paymentId: payment.id }, 201);
}
