import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlgApiClient } from './client.js';

function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  });
}
describe('owner workflow backend contracts', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('uses the authorized lookup and governance routes', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/legacy-archive/archive-1')) {
        return json({
          id: 'archive-1',
          batchId: 'batch-1',
          category: 'STUDENT',
          sourceFileId: 'file-1',
          sourceFileName: 'legacy.xlsx',
          sheetName: 'Students',
          rowNumber: 4,
          dataHash: 'hash',
          createdAt: '2026-08-23T00:00:00.000Z',
          data: { publicId: 'PLG-1' },
        });
      }
      return json({ items: [], nextCursor: null });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new PlgApiClient({ baseUrl: '/api/v1' });
    await client.listLeadAssignees('branch-1', 'Mona');
    await client.listBusinessContactCandidates('branch-1', 'Nour');
    await client.listAuditEvents({ action: 'student.merge' });
    await client.listLegacyArchive({ sheetName: 'Students' });
    await client.getLegacyArchiveRecord('archive-1');
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      '/api/v1/leads/assignees?branchId=branch-1&search=Mona&limit=30',
      '/api/v1/business-accounts/contact-candidates?branchId=branch-1&search=Nour&limit=20',
      '/api/v1/audit-events?action=student.merge',
      '/api/v1/legacy-archive?sheetName=Students',
      '/api/v1/legacy-archive/archive-1',
    ]);
  });
  it('sends concurrency and idempotency proof for protected decisions', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/eligible-ledger-entries')) return json({ items: [], nextCursor: null });
      if (url.includes('/module-retakes/'))
        return json({ id: 'retake-1', status: 'APPROVED', version: 8 });
      if (url.includes('/receipt'))
        return json({ id: 'receipt-1', paymentId: 'payment-1', serialNumber: 'R-1' });
      return json({
        sourcePersonId: 'source-1',
        targetPersonId: 'target-1',
        targetVersion: 5,
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new PlgApiClient({ baseUrl: '/api/v1', getCsrfToken: () => 'csrf' });
    await client.decideModuleRetake('retake-1', 'approve', 'Evidence reviewed', 7);
    await client.listEligibleInvoiceEntries({
      billingAccountId: 'billing-1',
      enrollmentId: 'enrollment-1',
    });
    await client.issueReceipt('payment-1', 'receipt-key');
    await client.mergeStudent('source-1', 'target-1', 4, 'Duplicate profile', 3, 'merge-key');
    const requests = fetchMock.mock.calls.map(([url, init]) => ({
      body: init?.body,
      headers: new Headers(init?.headers),
      method: init?.method,
      url: String(url),
    }));
    expect(requests[0]).toMatchObject({
      method: 'POST',
      url: '/api/v1/module-retakes/retake-1/approve',
    });
    expect(requests[0]?.headers.get('if-match')).toBe('7');
    expect(requests[1]?.url).toBe(
      '/api/v1/invoices/eligible-ledger-entries?billingAccountId=billing-1&enrollmentId=enrollment-1',
    );
    expect(requests[2]?.headers.get('idempotency-key')).toBe('receipt-key');
    expect(requests[3]?.headers.get('if-match')).toBe('3');
    expect(requests[3]?.headers.get('idempotency-key')).toBe('merge-key');
    expect(requests[3]?.body).toBe(
      JSON.stringify({ targetPersonId: 'target-1', targetVersion: 4, reason: 'Duplicate profile' }),
    );
  });
  it('keeps financial, transfer, approval and access mutations server-confirmed', async () => {
    const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/payments')) {
        return json({ id: 'payment-1', status: 'POSTED', version: 2, receiptSerial: 'R-1' });
      }
      if (url.includes('/pricing-agreements/')) {
        return json({
          id: 'pricing-1',
          status: 'APPROVED',
          version: 9,
          lockVersion: 9,
          subtotal: '5000.00',
          discountAmount: '500.00',
          totalAmount: '4500.00',
          requiredApprovalTier: 1,
        });
      }
      if (url.includes(`/users/${userId}/`)) {
        return json({
          id: userId,
          publicId: 'PLG-USR-1',
          name: 'Test User',
          status: 'ACTIVE',
          preferredLocale: 'en',
          mustChangePassword: false,
          version: 12,
          employeeCode: null,
          identifiers: [],
          roles: [],
          branches: [],
          createdAt: '2026-08-24T12:00:00.000Z',
          updatedAt: '2026-08-24T12:00:00.000Z',
        });
      }
      return json({ id: 'enrollment-1', state: 'ACTIVE', version: 6 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new PlgApiClient({ baseUrl: '/api/v1', getCsrfToken: () => 'csrf' });
    await client.createPayment(
      {
        amount: '4000.00',
        billingAccountId: 'billing-1',
        enrollmentId: 'enrollment-1',
        methodId: 'cash-1',
        receivedAt: '2026-08-24T12:00:00.000Z',
      },
      'payment-key',
    );
    await client.transferEnrollment('enrollment-1', 'cohort-2', 'Schedule conflict', 5);
    await client.decidePricingApproval('pricing-1', 'approve', 'Reviewed', 8, 'approval-key');
    await client.replaceUserRoles(userId, { ids: ['role-1'], reason: 'Annual access review' }, 11);
    await client.replaceUserBranches(
      userId,
      { ids: ['branch-1'], reason: 'Annual access review' },
      11,
    );
    const requests = fetchMock.mock.calls.map(([url, init]) => ({
      body: init?.body,
      headers: new Headers(init?.headers),
      method: init?.method,
      url: String(url),
    }));
    expect(requests[0]).toMatchObject({ method: 'POST', url: '/api/v1/payments' });
    expect(requests[0]?.headers.get('idempotency-key')).toBe('payment-key');
    expect(requests[1]).toMatchObject({
      method: 'POST',
      url: '/api/v1/enrollments/enrollment-1/transfer',
    });
    expect(requests[1]?.headers.get('if-match')).toBe('5');
    expect(requests[2]?.headers.get('if-match')).toBe('8');
    expect(requests[2]?.headers.get('idempotency-key')).toBe('approval-key');
    expect(requests[3]).toMatchObject({ method: 'PUT', url: `/api/v1/users/${userId}/roles` });
    expect(requests[3]?.headers.get('if-match')).toBe('11');
    expect(requests[4]).toMatchObject({ method: 'PUT', url: `/api/v1/users/${userId}/branches` });
    expect(requests[4]?.headers.get('if-match')).toBe('11');
  });
  it('reads a scoped Paymob attempt without sending a mutation', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      json({
        attemptId: 'attempt-1',
        status: 'PENDING',
        amount: '4000.00',
        currencyCode: 'EGP',
        paymentId: null,
        updatedAt: '2026-08-24T12:00:00.000Z',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new PlgApiClient({ baseUrl: '/api/v1' });
    await client.getPaymobCheckoutStatus('attempt-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('/api/v1/payment-gateway-attempts/attempt-1');
    expect(init?.method).toBe('GET');
  });
  it('exposes stable detail routes for operational records', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json({ id: 'record-1' }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new PlgApiClient({ baseUrl: '/api/v1' });
    await client.getTrainer('trainer-1');
    await client.getAuditEvent('audit-1');
    await client.getPayment('payment-1');
    await client.getInvoice('invoice-1');
    await client.getReceipt('receipt-1');
    await client.getOwnerSession('session-1');
    expect(fetchMock.mock.calls.map(([url, init]) => [String(url), init?.method])).toEqual([
      ['/api/v1/trainers/trainer-1', 'GET'],
      ['/api/v1/audit-events/audit-1', 'GET'],
      ['/api/v1/payments/payment-1', 'GET'],
      ['/api/v1/invoices/invoice-1', 'GET'],
      ['/api/v1/receipts/receipt-1', 'GET'],
      ['/api/v1/sessions/session-1', 'GET'],
    ]);
  });
  it('preserves concurrency and idempotency headers across release-critical actions', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      json({ id: 'record-1', recoveryCodes: ['code-1'] }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new PlgApiClient({ baseUrl: '/api/v1', getCsrfToken: () => 'csrf' });
    await client.regenerateRecoveryCodes();
    await client.cancelInvoice('invoice-1', 'Duplicate draft', 3, 'cancel-key');
    await client.voidInvoice('invoice-2', 'Compliance correction', 4, 'void-key');
    await client.createInvoiceCreditNote('invoice-3', '250.00', 'Service adjustment', 'credit-key');
    await client.updateInstallmentSchedule(
      'schedule-1',
      [{ dueDate: '2026-09-01T00:00:00.000Z', amount: '1000.00' }],
      5,
      'schedule-update-key',
    );
    await client.approveInstallmentSchedule('schedule-1', 6, 'schedule-approve-key');
    await client.replaceProgramVersionCurriculum(
      'version-1',
      [{ moduleId: 'module-1', ordinal: 1, required: true }],
      7,
    );
    await client.archiveProgramVersion('version-1', 'Superseded by 2027 edition', 8);
    const requests = fetchMock.mock.calls.map(([url, init]) => ({
      body: init?.body,
      headers: new Headers(init?.headers),
      method: init?.method,
      url: String(url),
    }));
    expect(requests[0]).toMatchObject({
      method: 'POST',
      url: '/api/v1/auth/mfa/recovery-codes/regenerate',
    });
    expect(requests[1]?.headers.get('if-match')).toBe('3');
    expect(requests[1]?.headers.get('idempotency-key')).toBe('cancel-key');
    expect(requests[2]?.headers.get('if-match')).toBe('4');
    expect(requests[2]?.headers.get('idempotency-key')).toBe('void-key');
    expect(requests[3]?.headers.get('idempotency-key')).toBe('credit-key');
    expect(requests[4]?.headers.get('if-match')).toBe('5');
    expect(requests[4]?.headers.get('idempotency-key')).toBe('schedule-update-key');
    expect(requests[5]?.headers.get('if-match')).toBe('6');
    expect(requests[5]?.headers.get('idempotency-key')).toBe('schedule-approve-key');
    expect(requests[6]?.headers.get('if-match')).toBe('7');
    expect(requests[7]?.headers.get('if-match')).toBe('8');
  });
});
