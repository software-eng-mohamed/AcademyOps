import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeManagementAction, uploadManagementCertificate } from '@/api/management/commands';
import { getManagementPage, managementRow } from '@/api/management/queries';
import {
  type ManagementAction,
  rowActions,
  validateManagementAction,
} from '@/features/management/actions';
import type { ManagementResource } from '@/features/management/config';

function json(data: unknown) {
  return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const values = {
  accountType: 'STUDENT',
  studentId: 'student-1',
  enrollmentId: 'enrollment-1',
  cohortId: 'cohort-1',
  cohortModuleId: 'module-1',
  ordinal: '2',
  deliveryMode: 'IN_PERSON',
  roomId: 'room-1',
  trainerId: 'trainer-1',
  startsAt: '2026-09-05T09:00',
  endsAt: '2026-09-05T11:00',
  receivedAt: '2026-09-05T09:00',
  amount: '125.50',
  methodId: 'cash',
  legalName: 'Company Ltd',
  displayName: 'Company',
  status: 'PRESENT',
  reason: 'Verified by owner',
  quantity: '1',
  unitAmount: '125.50',
  ledgerEntryId: 'charge-1',
  descriptionAr: 'رسوم الدراسة',
  descriptionEn: 'Tuition',
};
const row = managementRow('sessions', {
  id: 'record-1',
  version: 7,
  status: 'SCHEDULED',
  enrollmentId: 'enrollment-1',
  attendance: { id: 'attendance-1', version: 3 },
});
describe('management generated API wiring', () => {
  it('uploads PDFs with the certificate version and the same retry key', async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => json({}));
    vi.stubGlobal('fetch', fetch);
    const file = new File(['%PDF-1.4'], 'certificate.pdf', { type: 'application/pdf' });
    await uploadManagementCertificate('certificate-1', 4, file, 'upload-key');
    const call = fetch.mock.calls[0];
    expect(call?.[0]).toBe('/api/v1/certificates/certificate-1/file');
    expect(new Headers(call?.[1].headers).get('if-match')).toBe('4');
    expect(new Headers(call?.[1].headers).get('idempotency-key')).toBe('upload-key');
    expect(call?.[1].body).toBeInstanceOf(FormData);
  });
  it('rejects invalid uploads before any network request', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(
      uploadManagementCertificate('c', 1, new File(['x'], 'bad.txt'), 'key'),
    ).rejects.toThrow('invalidPdf');
    await expect(
      uploadManagementCertificate('c', 0, new File(['x'], 'file.pdf'), 'key'),
    ).rejects.toThrow('versionRequired');
    await expect(
      uploadManagementCertificate(
        'c',
        1,
        new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.pdf'),
        'key',
      ),
    ).rejects.toThrow('invalidPdf');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps installments from the same enrollment as distinct rows', () => {
    const first = managementRow('aging', { installmentId: 'i-1', enrollmentId: 'e-1' });
    const second = managementRow('aging', { installmentId: 'i-2', enrollmentId: 'e-1' });
    expect(first.id).toBe('i-1');
    expect(second.id).toBe('i-2');
  });
  it.each<[ManagementAction, string]>([
    ['createSession', '/sessions'],
    ['reschedule', '/sessions/record-1/reschedule'],
    ['cancelSession', '/sessions/record-1/cancel'],
    ['completeSession', '/sessions/record-1/complete'],
    ['openWindow', '/sessions/record-1/attendance-window/open'],
    ['closeWindow', '/sessions/record-1/attendance-window/close'],
    ['recordAttendance', '/sessions/session-1/attendance/manual'],
    ['correctAttendance', '/attendance/attendance-1/corrections'],
    ['createAccount', '/business-accounts'],
    ['editAccount', '/business-accounts/record-1'],
    ['recordPayment', '/payments'],
    ['postPayment', '/payments/record-1/post'],
    ['rejectPayment', '/payments/record-1/reject'],
    ['issueReceipt', '/payments/record-1/receipt'],
    ['requestRefund', '/payments/record-1/refund-requests'],
    ['createInvoice', '/invoices'],
    ['issueInvoice', '/invoices/record-1/issue'],
    ['cancelInvoice', '/invoices/record-1/cancel'],
    ['voidInvoice', '/invoices/record-1/void'],
    ['creditNote', '/invoices/record-1/credit-notes'],
    ['evaluateCertificate', '/certificates/evaluate'],
    ['issueCertificate', '/certificates/issue'],
    ['revokeCertificate', '/certificates/record-1/revoke'],
    ['printCertificate', '/certificates/record-1/print'],
    ['readyCertificate', '/certificates/record-1/ready'],
    ['collectCertificate', '/certificates/record-1/collect'],
    ['createExport', '/reports/finance/receivables/exports'],
  ])('connects %s to its real command endpoint', async (action, path) => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) =>
      json({ id: 'record-1', billingAccountId: 'billing-1' }),
    );
    vi.stubGlobal('fetch', fetch);
    await executeManagementAction(
      { action, resource: 'sessions', row, sessionId: 'session-1' },
      { ...values, ...(action === 'editAccount' ? { status: 'ARCHIVED' } : {}) },
      'stable-key',
      'branch-1',
    );
    const call = fetch.mock.calls.at(-1);
    expect(call?.[0]).toBe(`/api/v1${path}`);
    expect(call?.[1].method).toBe(action === 'editAccount' ? 'PATCH' : 'POST');
    expect(new Headers(call?.[1].headers).get('idempotency-key')).toBe('stable-key');
  });
  it('uses the attendance record version for corrections, not the enrollment/session version', async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => json({}));
    vi.stubGlobal('fetch', fetch);
    await executeManagementAction(
      { action: 'correctAttendance', resource: 'roster', row },
      values,
      'key',
    );
    expect(new Headers(fetch.mock.calls[0]?.[1].headers).get('if-match')).toBe('3');
  });
  it('sends management wall-clock values as Cairo instants', async () => {
    const fetch = vi.fn(async (_url: string, init: RequestInit) =>
      json(init.method === 'GET' ? { billingAccountId: 'billing-1' } : { id: 'record-1' }),
    );
    vi.stubGlobal('fetch', fetch);
    await executeManagementAction(
      { action: 'createSession', resource: 'sessions' },
      { ...values, startsAt: '2026-09-08T18:00', endsAt: '2026-09-08T20:00' },
      'session-key',
      'branch-1',
    );
    const sessionBody = JSON.parse(String(fetch.mock.calls[0]?.[1].body));
    expect(sessionBody.startsAt).toBe('2026-09-08T15:00:00.000Z');
    expect(sessionBody.endsAt).toBe('2026-09-08T17:00:00.000Z');
    await executeManagementAction(
      { action: 'recordPayment', resource: 'payments' },
      { ...values, receivedAt: '2026-01-15T18:00' },
      'payment-key',
    );
    const paymentCall = fetch.mock.calls.find(
      ([url, init]) => String(url).endsWith('/payments') && init.method === 'POST',
    );
    const paymentBody = JSON.parse(String(paymentCall?.[1].body));
    expect(paymentBody.receivedAt).toBe('2026-01-15T16:00:00.000Z');
  });
  it('uses complete Cairo days for session filters', async () => {
    const fetch = vi.fn(async (_url: string) => json({ items: [], nextCursor: null }));
    vi.stubGlobal('fetch', fetch);
    await getManagementPage('sessions', { from: '2026-09-08', to: '2026-09-08' });
    const url = new URL(fetch.mock.calls[0]?.[0] ?? '', 'http://localhost');
    expect(url.searchParams.get('from')).toBe('2026-09-07T21:00:00.000Z');
    expect(url.searchParams.get('to')).toBe('2026-09-08T20:59:59.999Z');
  });
  it('rejects invalid amounts and missing concurrency versions before sending commands', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(
      executeManagementAction(
        { action: 'requestRefund', resource: 'payments', row },
        { ...values, amount: '-1' },
        'key',
      ),
    ).rejects.toThrow('invalidAmount');
    await expect(
      executeManagementAction(
        { action: 'postPayment', resource: 'payments', row: { ...row, version: 0 } },
        {},
        'key',
      ),
    ).rejects.toThrow('version');
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each<[ManagementResource, string, string]>([
    ['sessions', 'SCHEDULED', 'status'],
    ['certificates', 'ISSUED', 'validityStatus'],
    ['businessAccounts', 'ARCHIVED', 'status'],
    ['payments', 'PENDING_VERIFICATION', 'status'],
    ['invoices', 'ISSUED', 'status'],
  ])(
    'passes supported %s filters and cursor to the backend',
    async (resource, status, parameter) => {
      const fetch = vi.fn(async (_url: string) => json({ items: [], nextCursor: 'next' }));
      vi.stubGlobal('fetch', fetch);
      const page = await getManagementPage(resource, { status, cursor: 'cursor-1' });
      expect(fetch.mock.calls[0]?.[0]).toContain(`${parameter}=${status}`);
      expect(fetch.mock.calls[0]?.[0]).toContain('cursor=cursor-1');
      expect(page.nextCursor).toBe('next');
    },
  );
  it('keeps finance totals server-sourced while paginating aging rows', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        json(
          url.includes('/aging')
            ? {
                asOf: '2026-09-04',
                currencyCode: 'EGP',
                totals: { CURRENT: '260.00' },
                rows: Array.from({ length: 26 }, (_, i) => ({
                  installmentId: `installment-${i}`,
                  outstanding: '10.00',
                })),
              }
            : { totals: { outstanding: '345.67' }, currencyCode: 'EGP', enrollmentCount: 8 },
        ),
      ),
    );
    const page = await getManagementPage('aging', { page: 2 });
    expect(page.items).toHaveLength(1);
    expect(page.pages).toBe(2);
    expect(page.summary?.totals).toEqual({ outstanding: '345.67' });
  });
});
describe('management states and validation', () => {
  it('limits completed sessions and offers only reissue for revoked certificates', () => {
    expect(rowActions('sessions', { ...row, status: 'COMPLETED' })).toEqual([]);
    expect(rowActions('certificates', { ...row, status: 'REVOKED' })).toEqual([
      'reissueCertificate',
    ]);
    expect(
      rowActions('certificates', {
        ...row,
        status: 'ISSUED',
        data: { pdfStatus: 'AVAILABLE', fulfillmentStatus: 'NOT_PRINTED' },
      }),
    ).toContain('printCertificate');
    expect(
      rowActions('payments', { ...row, status: 'POSTED', data: { receipt: { id: 'r' } } }),
    ).not.toContain('issueReceipt');
  });
  it('validates time ordering, monetary precision, and mandatory manual reasons', () => {
    expect(validateManagementAction('createSession', { ...values, endsAt: values.startsAt })).toBe(
      'invalidDate',
    );
    expect(validateManagementAction('createSession', { ...values, endsAt: 'bad-date' })).toBe(
      'invalidDate',
    );
    expect(validateManagementAction('recordPayment', { ...values, receivedAt: 'bad-date' })).toBe(
      'invalidDate',
    );
    expect(
      validateManagementAction('createSession', {
        ...values,
        startsAt: '2026-04-24T00:30',
        endsAt: '2026-04-24T02:00',
      }),
    ).toBe('invalidDate');
    expect(validateManagementAction('requestRefund', { amount: '1.123', reason: 'Refund' })).toBe(
      'invalidAmount',
    );
    expect(validateManagementAction('recordAttendance', { status: 'PRESENT', reason: 'a' })).toBe(
      'reasonRequired',
    );
  });
});
