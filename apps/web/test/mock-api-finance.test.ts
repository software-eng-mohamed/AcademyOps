import { expect, it } from 'vitest';
import { DEMO_COOKIE } from '@/api/demo/cookie-state';
import { DEMO_EMAIL, DEMO_ORGANIZATION, DEMO_PASSWORD } from '@/api/demo/credentials';
import { handleDemoRequest } from '@/api/demo/router';
import { demoId, object, string } from '@/api/demo/shared';

async function visitor() {
  let cookie = '';
  const call = async (
    path: string,
    method = 'GET',
    body?: unknown,
    headers: Record<string, string> = {},
  ) => {
    const response = await handleDemoRequest(
      new Request(`https://academyops.demo/api/v1/${path}`, {
        method,
        headers: { cookie, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
    const updated = response.headers
      .getSetCookie()
      .find((value) => value.startsWith(`${DEMO_COOKIE}=`));
    if (updated) cookie = updated.split(';')[0] ?? cookie;
    return response;
  };
  expect(
    (
      await call('auth/login', 'POST', {
        identifier: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        organizationCode: DEMO_ORGANIZATION,
      })
    ).status,
  ).toBe(201);
  return call;
}
const invoiceBody = (index: number) => ({
  billingAccountId: demoId(2000 + index),
  lines: [
    {
      ledgerEntryId: demoId(2700 + index),
      descriptionEn: 'Synthetic tuition',
      descriptionAr: 'رسوم تجريبية',
      quantity: '1',
      unitAmount: '3000.00',
      taxAmount: '0.00',
    },
  ],
});

it('approves a different maker’s refund once and synchronizes balances, invoices and payment history', async () => {
  const call = await visitor();
  const approve = await call(`refund-requests/${demoId(2800)}/approve`, 'POST', undefined, {
    'Idempotency-Key': 'refund-review',
  });
  expect(approve.status).toBe(201);
  const refund = await approve.json();
  expect(refund).toMatchObject({ amount: '250.00' });
  const repeated = await call(`refund-requests/${demoId(2800)}/approve`, 'POST', undefined, {
    'Idempotency-Key': 'refund-review',
  });
  expect(await repeated.json()).toEqual(refund);
  expect(await (await call(`enrollments/${demoId(300)}/finance-summary`)).json()).toMatchObject({
    balance: '250.00',
    totalCredits: '2750.00',
  });
  expect(await (await call(`invoices/${demoId(2300)}`)).json()).toMatchObject({
    settledAmount: '2750.00',
    paymentStatus: 'PARTIALLY_PAID',
  });
  expect(await (await call(`payments/${demoId(2100)}`)).json()).toMatchObject({
    refundedAmount: '250.00',
    pendingApprovals: [],
    refunds: [{ amount: '250.00' }],
  });
});

it('enforces maker/checker and lets the request maker withdraw their own pending request', async () => {
  const call = await visitor();
  const requested = await call(`payments/${demoId(2102)}/refund-requests`, 'POST', {
    amount: '100.00',
    reason: 'Synthetic refund request',
  });
  expect(requested.status).toBe(201);
  const id = string(object(await requested.json()).id);
  const ownApproval = await call(`refund-requests/${id}/approve`, 'POST');
  expect(ownApproval.status).toBe(409);
  expect(await ownApproval.json()).toMatchObject({ code: 'MAKER_CHECKER_REQUIRED' });
  expect(
    (await call(`refund-requests/${id}/withdraw`, 'POST', { reason: 'Keep this sample payment' }))
      .status,
  ).toBe(201);
  expect(await (await call(`payments/${demoId(2102)}`)).json()).toMatchObject({
    refundedAmount: '0.00',
    pendingApprovals: [],
  });
});

it('reverses the other maker’s payment and restores the full receivable without touching another student', async () => {
  const call = await visitor();
  expect((await call(`payment-reversal-requests/${demoId(2801)}/approve`, 'POST')).status).toBe(
    201,
  );
  expect(await (await call(`payments/${demoId(2101)}`)).json()).toMatchObject({
    status: 'REVERSED',
    pendingApprovals: [],
  });
  expect(await (await call(`enrollments/${demoId(301)}/finance-summary`)).json()).toMatchObject({
    balance: '3000.00',
  });
  expect(await (await call(`enrollments/${demoId(300)}/finance-summary`)).json()).toMatchObject({
    balance: '0.00',
  });
});

it('creates and issues an invoice, guards versions and applies bounded credit notes to the same account', async () => {
  const call = await visitor();
  const eligible = object(
    await (await call(`invoices/eligible-ledger-entries?billingAccountId=${demoId(2007)}`)).json(),
  );
  expect(eligible.items).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: demoId(2707) })]),
  );
  const created = await call('invoices', 'POST', invoiceBody(7));
  expect(created.status).toBe(201);
  const id = string(object(await created.json()).id);
  expect((await call(`invoices/${id}/issue`, 'POST', undefined, { 'If-Match': '0' })).status).toBe(
    409,
  );
  expect((await call(`invoices/${id}/issue`, 'POST', undefined, { 'If-Match': '1' })).status).toBe(
    201,
  );
  expect(
    (
      await call(`invoices/${id}/credit-notes`, 'POST', {
        amount: '250.10',
        reason: 'Synthetic tuition adjustment',
      })
    ).status,
  ).toBe(201);
  expect(await (await call(`invoices/${id}`)).json()).toMatchObject({
    status: 'ISSUED',
    creditedAmount: '250.10',
    settledAmount: '0.00',
  });
  expect(await (await call(`enrollments/${demoId(307)}/finance-summary`)).json()).toMatchObject({
    balance: '2749.90',
  });
  expect(
    (await call(`invoices/${id}/credit-notes`, 'POST', { amount: '2750.00', reason: 'Too large' }))
      .status,
  ).toBe(409);
  expect(
    (
      await call(
        `invoices/${id}/void`,
        'POST',
        { reason: 'Credit prevents voiding' },
        { 'If-Match': '3' },
      )
    ).status,
  ).toBe(409);
});

it('cancels a draft and voids an unsettled issued invoice, releasing their source entries', async () => {
  const call = await visitor();
  const draft = await call('invoices', 'POST', invoiceBody(11));
  const id = string(object(await draft.json()).id);
  expect(
    (
      await call(
        `invoices/${id}/cancel`,
        'POST',
        { reason: 'Synthetic draft cancellation' },
        { 'If-Match': '1' },
      )
    ).status,
  ).toBe(201);
  const recreated = await call('invoices', 'POST', invoiceBody(11));
  expect(recreated.status).toBe(201);
  const secondId = string(object(await recreated.json()).id);
  expect(
    (await call(`invoices/${secondId}/issue`, 'POST', undefined, { 'If-Match': '1' })).status,
  ).toBe(201);
  expect(
    (
      await call(
        `invoices/${secondId}/void`,
        'POST',
        { reason: 'Synthetic void exercise' },
        { 'If-Match': '2' },
      )
    ).status,
  ).toBe(201);
  expect(await (await call(`invoices/${secondId}`)).json()).toMatchObject({ status: 'VOIDED' });
});
