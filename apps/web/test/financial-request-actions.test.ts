import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeManagementAction } from '@/api/management/commands';
import { managementRow } from '@/api/management/queries';
import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { financialRequestActions } from '@/features/management/action-access';
import { type ManagementAction, validateManagementAction } from '@/features/management/actions';

const user: DashboardUser = {
  id: 'maker',
  name: 'Owner',
  branches: [],
  organization: { name: 'Academy' },
  roles: [{ code: 'OWNER', name: 'Owner' }],
  permissions: [
    'refunds.request',
    'refunds.approve',
    'payments.reverse.request',
    'payments.reverse.approve',
  ].map((code) => ({ code, scopes: ['O'] })) as DashboardUser['permissions'],
};
const request = (kind: string, requestedBy = 'maker', status = 'REQUESTED') =>
  managementRow('payments', { id: 'request-1', kind, requestedBy, status });
afterEach(() => vi.unstubAllGlobals());

describe.each(['REFUND', 'REVERSAL'])('%s decision controls', (kind) => {
  const suffix = kind === 'REFUND' ? 'Refund' : 'Reversal';
  it('offers withdrawal only to the maker and checker actions only to another user', () => {
    expect(financialRequestActions(user, request(kind), 'POSTED')).toEqual([`withdraw${suffix}`]);
    expect(financialRequestActions(user, request(kind, 'another'), 'POSTED')).toEqual([
      `approve${suffix}`,
      `reject${suffix}`,
    ]);
  });
  it('requires corresponding permissions and a pending request', () => {
    expect(financialRequestActions({ ...user, permissions: [] }, request(kind), 'POSTED')).toEqual(
      [],
    );
    for (const status of ['APPROVED', 'REJECTED', 'WITHDRAWN']) {
      expect(financialRequestActions(user, request(kind, 'another', status), 'POSTED')).toEqual([]);
    }
  });
  it('allows closing a stale request after payment reversal without showing approve', () => {
    expect(financialRequestActions(user, request(kind, 'another'), 'REVERSED')).toEqual([
      `reject${suffix}`,
    ]);
    expect(financialRequestActions(user, request(kind), 'REVERSED')).toEqual([`withdraw${suffix}`]);
  });
});

describe.each<[ManagementAction, string]>([
  ['rejectRefund', 'refund-requests/request-1/reject'],
  ['withdrawRefund', 'refund-requests/request-1/withdraw'],
  ['rejectReversal', 'payment-reversal-requests/request-1/reject'],
  ['withdrawReversal', 'payment-reversal-requests/request-1/withdraw'],
])('%s submission', (action, path) => {
  it('requires a reason before any request', () => {
    expect(validateManagementAction(action, {})).toBe('required');
    expect(validateManagementAction(action, { reason: '  ' })).toBeTruthy();
  });
  it('sends the request id, trimmed reason and retry key through the generated client', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: 'request-1', status: 'REJECTED' }), {
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetch);
    await executeManagementAction(
      { action, resource: 'payments', row: request('REFUND') },
      { reason: '  Entered by mistake  ' },
      'decision-retry',
    );
    expect(fetch).toHaveBeenCalledWith(
      `/api/v1/${path}`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ reason: 'Entered by mistake' }),
      }),
    );
    expect(
      new Headers((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].headers).get(
        'idempotency-key',
      ),
    ).toBe('decision-retry');
  });
});
