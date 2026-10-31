import type { AccessContext } from '@academyops/contracts';
import type { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { readPaymentApprovals } from '../src/finance/finance-approval-read';

function fixture(grants: Array<[string, Set<string>]>) {
  const refundRequest = {
    findMany: vi.fn(() =>
      Promise.resolve([
        {
          id: 'refund-request',
          status: 'REQUESTED',
          requestedBy: 'maker',
          requestedAmount: { toFixed: () => '125.50' },
          reason: 'Refund requested',
          createdAt: new Date(),
        },
      ]),
    ),
  };
  const paymentReversalRequest = {
    findMany: vi.fn(() =>
      Promise.resolve([
        {
          id: 'reversal-request',
          status: 'REQUESTED',
          requestedBy: 'maker',
          reason: 'Reversal requested',
          createdAt: new Date(),
        },
      ]),
    ),
  };
  return {
    refundRequest,
    paymentReversalRequest,
    transaction: { refundRequest, paymentReversalRequest } as unknown as Prisma.TransactionClient,
    access: { organizationId: 'org-1', grants: new Map(grants) } as unknown as AccessContext,
  };
}
describe('pending financial approvals read boundary', () => {
  it('does not expose request metadata to payment readers or non-organization grants', async () => {
    const f = fixture([
      ['payments.read', new Set(['O'])],
      ['refunds.approve', new Set(['B'])],
    ]);
    expect(await readPaymentApprovals(f.transaction, f.access, 'payment-1')).toEqual([]);
    expect(f.refundRequest.findMany).not.toHaveBeenCalled();
    expect(f.paymentReversalRequest.findMany).not.toHaveBeenCalled();
  });
  it('scopes both pending queues to the authorized organization and inspected payment', async () => {
    const f = fixture([
      ['refunds.approve', new Set(['O'])],
      ['payments.reverse.approve', new Set(['O'])],
    ]);
    const result = await readPaymentApprovals(f.transaction, f.access, 'payment-1');
    for (const model of [f.refundRequest, f.paymentReversalRequest])
      expect(model.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-1', paymentId: 'payment-1', status: 'REQUESTED' },
        }),
      );
    expect(result.map((item) => item.kind)).toEqual(['REFUND', 'REVERSAL']);
    expect(result[0]?.requestedAmount).toBe('125.50');
    expect(result[0]?.requestedBy).toBe('maker');
  });
  it('does not conflate refund and reversal permissions', async () => {
    const f = fixture([['refunds.request', new Set(['O'])]]);
    expect(await readPaymentApprovals(f.transaction, f.access, 'payment-1')).toHaveLength(1);
    expect(f.paymentReversalRequest.findMany).not.toHaveBeenCalled();
  });
});
