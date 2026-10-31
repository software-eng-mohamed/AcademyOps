import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeManagementAction } from '@/api/management/commands';
import { managementRow } from '@/api/management/queries';
import {
  type AccessAction,
  type AccessValues,
  accessErrors,
  executeAccessAction,
  executeChannelAction,
  executeImportAction,
  importActions,
  resolveImportIssue,
  stageWorkbook,
  validWorkbook,
} from '@/api/system/commands';
import {
  getImportIssues,
  getSystemDetail,
  getSystemPage,
  type SystemFilters,
  systemRecord,
} from '@/api/system/queries';
import { rowActions } from '@/features/management/actions';
import { invoiceLines, validInvoiceLines } from '@/features/management/invoice-values';
import type { SystemResource } from '@/features/system/config';

const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const values: AccessValues = {
  name: 'Academy Operations',
  code: 'OPERATIONS_2',
  email: 'team@example.test',
  employeeCode: '',
  preferredLocale: 'ar',
  status: 'ACTIVE',
  isActive: false,
  reason: 'Reassigned after review',
  roleIds: ['role-1'],
  branchIds: ['branch-1'],
  grants: [{ permissionCode: 'students.read_basic', scope: 'B' }],
};

describe('Owner system generated API connections', () => {
  it.each<[SystemResource, string, SystemFilters]>([
    ['users', '/users', { search: 'Team', status: 'SUSPENDED' }],
    ['roles', '/roles', { search: 'Manager' }],
    ['branches', '/branches', { search: 'Cairo' }],
    ['imports', '/imports/batches', { status: 'VALIDATED' }],
    ['audit', '/audit-events', { search: 'update', from: '2026-09-01', to: '2026-09-05' }],
    ['legacyArchive', '/legacy-archive', { search: 'Master Sheet' }],
  ])('connects %s lists, filters and cursors', async (resource, path, filters) => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) =>
      json({ items: [{ id: 'record-1' }], nextCursor: 'next-1' }),
    );
    vi.stubGlobal('fetch', fetch);
    const result = await getSystemPage(resource, { ...filters, cursor: 'cursor-1' });
    expect(result.items[0]?.id).toBe('record-1');
    expect(result.nextCursor).toBe('next-1');
    const url = new URL(fetch.mock.calls[0]?.[0] ?? '', 'http://localhost');
    expect(url.pathname).toBe(`/api/v1${path}`);
    expect(url.searchParams.get('cursor')).toBe('cursor-1');
    expect(url.searchParams.has('limit')).toBe(false);
    if (resource === 'audit') {
      expect(url.searchParams.get('action')).toBe('update');
      expect(url.searchParams.get('from')).toBe('2026-08-31T21:00:00.000Z');
      expect(url.searchParams.get('to')).toBe('2026-09-05T20:59:59.999Z');
    } else if (resource === 'legacyArchive')
      expect(url.searchParams.get('sheetName')).toBe('Master Sheet');
    else if (filters.search) expect(url.searchParams.get('search')).toBe(filters.search);
    if (filters.status) expect(url.searchParams.get('status')).toBe(filters.status);
  });
  it.each<[SystemResource, string]>([
    ['users', '/users'],
    ['roles', '/roles'],
    ['branches', '/branches'],
    ['imports', '/imports/batches'],
    ['audit', '/audit-events'],
    ['legacyArchive', '/legacy-archive'],
  ])('reads %s from its detail operation', async (resource, path) => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => json({ id: 'record-1' }));
    vi.stubGlobal('fetch', fetch);
    expect((await getSystemDetail(resource, 'record-1')).id).toBe('record-1');
    expect(fetch.mock.calls[0]?.[0]).toBe(`/api/v1${path}/record-1`);
  });
  it.each<[AccessAction, string, string]>([
    ['createUser', '/users', 'POST'],
    ['createRole', '/roles', 'POST'],
    ['createBranch', '/branches', 'POST'],
    ['editUser', '/users/record-1/status', 'PATCH'],
    ['editRole', '/roles/record-1', 'PATCH'],
    ['editBranch', '/branches/record-1', 'PATCH'],
    ['replaceRoles', '/users/record-1/roles', 'PUT'],
    ['replaceBranches', '/users/record-1/branches', 'PUT'],
    ['replaceGrants', '/roles/record-1/grants', 'PUT'],
  ])(
    'wires %s with versioned updates and no fabricated idempotency',
    async (action, path, method) => {
      const fetch = vi.fn(async (_url: string, _init: RequestInit) => json({ id: 'record-1' }));
      vi.stubGlobal('fetch', fetch);
      await executeAccessAction(action, values, { id: 'record-1', version: 7 });
      const init = fetch.mock.calls[0]?.[1];
      expect(fetch.mock.calls[0]?.[0]).toBe(`/api/v1${path}`);
      expect(init?.method).toBe(method);
      expect(new Headers(init?.headers).get('if-match')).toBe(
        action.startsWith('create') ? null : '7',
      );
      const body = JSON.parse(String(init?.body));
      if (action === 'createUser') {
        expect(body.roleIds).toEqual(['role-1']);
        expect(body.branchIds).toEqual(['branch-1']);
        expect(body.temporaryPassword).toBeUndefined();
        expect(body.activateNow).toBeUndefined();
      }
      if (action === 'replaceGrants') expect(body.grants).toEqual(values.grants);
    },
  );
  it('rejects invalid access data or an unversioned edit before sending', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(accessErrors('createUser', { ...values, name: ' ', email: 'bad' })).toEqual([
      'name',
      'email',
    ]);
    expect(accessErrors('createRole', { ...values, code: '1-invalid' })).toContain('code');
    expect(accessErrors('replaceRoles', { ...values, reason: '' })).toContain('reason');
    await expect(executeAccessAction('editBranch', values, { id: 'record-1' })).rejects.toThrow(
      'version',
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['validate', 'reconcile', 'promote', 'finalize', 'archive'] as const)(
    'wires %s import commands',
    async (action) => {
      const fetch = vi.fn(async (_url: string, _init: RequestInit) => json({ id: 'batch-1' }));
      vi.stubGlobal('fetch', fetch);
      await executeImportAction(action, 'batch-1', 'stable-key', 'Archive after owner review');
      expect(fetch.mock.calls[0]?.[0]).toBe(
        `/api/v1/imports/batches/batch-1/${action === 'promote' ? 'promote-ready' : action === 'archive' ? 'archive-quarantined' : action}`,
      );
      expect(new Headers(fetch.mock.calls[0]?.[1].headers).get('idempotency-key')).toBe(
        'stable-key',
      );
    },
  );
  it('limits available import steps to the actual lifecycle', () => {
    expect(importActions({ id: 'batch', status: 'FINALIZED' })).toEqual([]);
    expect(importActions({ id: 'batch', status: 'STAGED' })).toEqual(['validate']);
    expect(importActions({ id: 'batch', status: 'VALIDATED', openIssues: 0 })).not.toContain(
      'finalize',
    );
    expect(importActions({ id: 'batch', status: 'RECONCILED', openIssues: 1 })).not.toContain(
      'finalize',
    );
    expect(importActions({ id: 'batch', status: 'RECONCILED', openIssues: 0 })).toContain(
      'finalize',
    );
  });
  it('uploads only a nonempty bounded workbook as multipart data', async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => json({ id: 'batch-1' }));
    vi.stubGlobal('fetch', fetch);
    expect(validWorkbook(new File([], 'blank.xlsx'))).toBe(false);
    expect(validWorkbook(new File(['data'], 'bad.csv'))).toBe(false);
    const file = new File(['xlsx test data'], 'source.xlsx');
    await stageWorkbook(file);
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/v1/imports/batches');
    expect(fetch.mock.calls[0]?.[1].body).toBeInstanceOf(FormData);
    expect(new Headers(fetch.mock.calls[0]?.[1].headers).get('content-type')).toBeNull();
  });
  it('reads issue pages and sends reviewed fields to the matching row', async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) =>
      json({ items: [], nextCursor: null }),
    );
    vi.stubGlobal('fetch', fetch);
    await getImportIssues('batch', 'OPEN', 'cursor');
    expect(fetch.mock.calls[0]?.[0]).toContain(
      '/imports/batches/batch/issues?status=OPEN&cursor=cursor',
    );
    await resolveImportIssue('batch', 'issue', {
      schemaVersion: 'plg-import-correction/v1',
      decision: 'CORRECT',
      expectedRowHash: 'a'.repeat(64),
      expectedIssueCode: 'STUDENT_NAME_REQUIRED',
      expectedIssueVersion: 1,
      correction: { kind: 'ROW_VALUES', values: { name: 'Person' } },
      note: 'Corrected from source',
    });
    expect(fetch.mock.calls[1]?.[0]).toBe('/api/v1/imports/batches/batch/issues/issue');
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1].body))).toMatchObject({
      decision: 'CORRECT',
      expectedIssueCode: 'STUDENT_NAME_REQUIRED',
      correction: { kind: 'ROW_VALUES', values: { name: 'Person' } },
    });
  });
  it.each(['connect', 'disable', 'reset'] as const)(
    'versions %s channel commands, including an initial version of zero',
    async (action) => {
      const fetch = vi.fn(async (_url: string, _init: RequestInit) => json({ version: 1 }));
      vi.stubGlobal('fetch', fetch);
      await executeChannelAction(action, 0, 'Owner reviewed channel', 'channel-key');
      expect(fetch.mock.calls[0]?.[0]).toBe(`/api/v1/messaging/otp-channel/${action}`);
      expect(new Headers(fetch.mock.calls[0]?.[1].headers).get('if-match')).toBe('0');
      expect(new Headers(fetch.mock.calls[0]?.[1].headers).get('idempotency-key')).toBe(
        'channel-key',
      );
    },
  );
  it('fails closed for malformed record identity', () => expect(() => systemRecord({})).toThrow());
});
describe('Owner finance and certificate completion', () => {
  const line = {
    key: 'one',
    ledgerEntryId: 'charge-1',
    descriptionAr: 'رسوم',
    descriptionEn: 'Tuition',
    quantity: '1',
    unitAmount: '125.50',
    taxAmount: '',
  };
  it('validates complete, distinct invoice lines and preserves exact decimal strings', async () => {
    const lines = JSON.stringify([
      line,
      { ...line, key: 'two', ledgerEntryId: 'charge-2', unitAmount: '10.25' },
    ]);
    expect(validInvoiceLines(lines)).toBe(true);
    expect(validInvoiceLines(JSON.stringify([line, line]))).toBe(false);
    expect(validInvoiceLines(JSON.stringify([{ ...line, quantity: '-1' }]))).toBe(false);
    expect(validInvoiceLines('null')).toBe(false);
    expect(invoiceLines('broken')).toEqual([]);
    const fetch = vi.fn(async (_url: string, _init: RequestInit) =>
      json(_url.includes('/enrollments/') ? { billingAccountId: 'account' } : { id: 'invoice' }),
    );
    vi.stubGlobal('fetch', fetch);
    await executeManagementAction(
      { action: 'createInvoice', resource: 'invoices' },
      {
        accountType: 'STUDENT',
        studentId: 'student',
        enrollmentId: 'enrollment',
        invoiceLines: lines,
      },
      'invoice-key',
    );
    const sent = JSON.parse(String(fetch.mock.calls.at(-1)?.[1].body));
    expect(sent.lines).toHaveLength(2);
    expect(sent.lines[1].unitAmount).toBe('10.25');
    expect(sent.lines[0].key).toBeUndefined();
  });
  it('offers reissue only for revoked certificates', () => {
    expect(
      rowActions(
        'certificates',
        managementRow('certificates', { id: 'c', validityStatus: 'ISSUED' }),
      ),
    ).not.toContain('reissueCertificate');
    expect(
      rowActions(
        'certificates',
        managementRow('certificates', { id: 'c', validityStatus: 'REVOKED' }),
      ),
    ).toEqual(['reissueCertificate']);
  });
});
