import type { AccessContext } from '@academyops/contracts';
import type { Prisma } from '@prisma/client';

// Called only after payment visibility has been checked. Approval metadata is
// additionally restricted to organization-scoped requesters/reviewers.
export async function readPaymentApprovals(
  transaction: Prisma.TransactionClient,
  access: AccessContext,
  paymentId: string,
) {
  const has = (codes: Array<Parameters<AccessContext['grants']['get']>[0]>) =>
    codes.some((code) => access.grants.get(code)?.has('O'));
  const where = { organizationId: access.organizationId, paymentId, status: 'REQUESTED' };
  const select = { id: true, status: true, requestedBy: true, reason: true, createdAt: true };
  const [refunds, reversals] = await Promise.all([
    has(['refunds.request', 'refunds.approve'])
      ? transaction.refundRequest.findMany({
          where,
          select: { ...select, requestedAmount: true },
          orderBy: { createdAt: 'asc' },
        })
      : [],
    has(['payments.reverse.request', 'payments.reverse.approve'])
      ? transaction.paymentReversalRequest.findMany({
          where,
          select,
          orderBy: { createdAt: 'asc' },
        })
      : [],
  ]);
  return [
    ...refunds.map((request) => ({
      ...request,
      kind: 'REFUND' as const,
      requestedAmount: request.requestedAmount.toFixed(2),
    })),
    ...reversals.map((request) => ({
      ...request,
      kind: 'REVERSAL' as const,
      requestedAmount: null,
    })),
  ];
}
