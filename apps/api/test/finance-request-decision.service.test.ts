import { describe, expect, it, vi } from 'vitest';
import type { AccessContext } from '@academyops/contracts';
import { FinanceRequestDecisionService } from '../src/finance/finance-request-decision.service';

function setup(kind: 'REFUND' | 'REVERSAL', requestChanges = {}) {
  const request = {
    id: 'request',
    paymentId: 'payment',
    requestedBy: 'maker',
    status: 'REQUESTED',
    decidedBy: null,
    decisionReason: null,
    ...requestChanges,
  };
  const repository = {
    findFirst: vi.fn().mockResolvedValue(request),
    update: vi.fn().mockResolvedValue(request),
  };
  const transaction = {
    refundRequest: repository,
    paymentReversalRequest: repository,
    payment: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'payment',
        billingAccountId: 'billing',
        enrollmentId: 'enrollment',
      }),
    },
    $queryRaw: vi.fn(),
  };
  const audit = { write: vi.fn() };
  const idempotency = {
    begin: vi.fn().mockResolvedValue({ replayed: false, recordId: 'idempotency' }),
    complete: vi.fn(),
  };
  const financeAccess = { assertBillingAccount: vi.fn() };
  const helper = { lockPayment: vi.fn(), paymentNotFound: vi.fn() };
  const service = new FinanceRequestDecisionService(
    ...([
      { serializable: (work: (tx: unknown) => unknown) => work(transaction) },
      audit,
      idempotency,
      financeAccess,
      helper,
    ] as unknown as ConstructorParameters<typeof FinanceRequestDecisionService>),
  );
  const access = { organizationId: 'organization', actorUserId: 'checker' } as AccessContext;
  const run = (
    decision: 'REJECTED' | 'WITHDRAWN',
    actorUserId = 'checker',
    reason = 'Entered by mistake',
  ) =>
    service.decide({ ...access, actorUserId }, kind, 'request', decision, reason, {
      correlationId: 'correlation',
      idempotencyKey: 'retry-key',
    });
  return { run, repository, transaction, financeAccess, idempotency, audit, helper };
}

describe.each(['REFUND', 'REVERSAL'] as const)('%s request decisions', (kind) => {
  it('records a checker rejection with reason, actor and timestamp without ledger mutation', async () => {
    const state = setup(kind);
    await expect(state.run('REJECTED')).resolves.toEqual({ id: 'request', status: 'REJECTED' });
    expect(state.repository.update).toHaveBeenCalledWith({
      where: { id: 'request', organizationId: 'organization', status: 'REQUESTED' },
      data: {
        status: 'REJECTED',
        decidedBy: 'checker',
        decidedAt: expect.any(Date) as unknown,
        decisionReason: 'Entered by mistake',
      },
    });
    expect(state.financeAccess.assertBillingAccount).toHaveBeenCalledWith(
      state.transaction,
      expect.objectContaining({ organizationId: 'organization' }),
      kind === 'REFUND' ? 'refunds.approve' : 'payments.reverse.approve',
      'billing',
      'enrollment',
    );
    expect(state.helper.lockPayment.mock.invocationCallOrder[0]).toBeLessThan(
      state.transaction.$queryRaw.mock.invocationCallOrder[0]!,
    );
    expect(state.audit.write).toHaveBeenCalledOnce();
  });
  it('requires the original requester for withdrawal and request permission', async () => {
    const state = setup(kind);
    await expect(state.run('WITHDRAWN')).rejects.toMatchObject({
      response: { code: 'REQUEST_WITHDRAW_REQUESTER_REQUIRED' },
    });
    await expect(state.run('WITHDRAWN', 'maker')).resolves.toMatchObject({ status: 'WITHDRAWN' });
    expect(state.financeAccess.assertBillingAccount).toHaveBeenLastCalledWith(
      state.transaction,
      expect.anything(),
      kind === 'REFUND' ? 'refunds.request' : 'payments.reverse.request',
      'billing',
      'enrollment',
    );
  });
  it('requires a checker distinct from the maker even with approval permission', async () => {
    const state = setup(kind);
    await expect(state.run('REJECTED', 'maker')).rejects.toMatchObject({
      response: { code: 'MAKER_CHECKER_REQUIRED' },
    });
    expect(state.repository.update).not.toHaveBeenCalled();
  });
  it.each(['APPROVED', 'WITHDRAWN', 'REJECTED'])(
    'does not overwrite an existing %s decision',
    async (status) => {
      const state = setup(kind, {
        status,
        decidedBy: 'different-checker',
        decisionReason: 'Original decision',
      });
      await expect(state.run('REJECTED')).rejects.toMatchObject({
        response: { code: 'FINANCIAL_REQUEST_ALREADY_DECIDED' },
      });
      expect(state.repository.update).not.toHaveBeenCalled();
      expect(state.audit.write).not.toHaveBeenCalled();
    },
  );
  it('accepts the identical terminal retry without rewriting the decision or audit', async () => {
    const state = setup(kind, {
      status: 'REJECTED',
      decidedBy: 'checker',
      decisionReason: 'Entered by mistake',
    });
    await expect(state.run('REJECTED')).resolves.toMatchObject({ status: 'REJECTED' });
    expect(state.repository.update).not.toHaveBeenCalled();
    expect(state.audit.write).not.toHaveBeenCalled();
    expect(state.idempotency.complete).toHaveBeenCalledOnce();
  });
  it('checks object scope before accessing idempotency responses', async () => {
    const state = setup(kind);
    state.financeAccess.assertBillingAccount.mockRejectedValueOnce(
      new Error('outside branch scope'),
    );
    await expect(state.run('REJECTED')).rejects.toThrow('outside branch scope');
    expect(state.idempotency.begin).not.toHaveBeenCalled();
  });
  it('scopes request lookup to the organization and rejects blank reasons', async () => {
    const state = setup(kind);
    await expect(state.run('REJECTED', 'checker', '   ')).rejects.toMatchObject({
      response: { code: 'FINANCIAL_REASON_INVALID' },
    });
    expect(state.repository.findFirst).not.toHaveBeenCalled();
    await state.run('REJECTED');
    expect(state.repository.findFirst).toHaveBeenCalledWith({
      where: { id: 'request', organizationId: 'organization' },
    });
  });
});
