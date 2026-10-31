import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlgApiClient } from '../src/client.js';

afterEach(() => vi.unstubAllGlobals());

const client = new PlgApiClient({
  baseUrl: 'http://localhost:3001/api/v1',
  getCsrfToken: () => 'csrf-import',
});

const batch = {
  id: 'batch-1',
  organizationId: 'org-1',
  status: 'VALIDATED',
  sourceSha256: 'a'.repeat(64),
  receivedAt: '2026-08-11T10:00:00.000Z',
  receivedBy: 'user-1',
  finalizedAt: null,
  finalizedBy: null,
  reconciliation: null,
  createdAt: '2026-08-11T10:00:00.000Z',
  updatedAt: '2026-08-11T10:05:00.000Z',
};

const issue = {
  id: 'issue-1',
  organizationId: 'org-1',
  importRowId: 'row-1',
  batchId: 'batch-1',
  severity: 'CRITICAL',
  code: 'PAYMENT_BREAKDOWN_MISMATCH',
  message: 'PAYMENT_BREAKDOWN_MISMATCH',
  details: {},
  status: 'OPEN',
  resolvedBy: null,
  resolvedAt: null,
  createdAt: '2026-08-11T10:01:00.000Z',
  row: {
    id: 'row-1',
    sheetName: 'Master Sheet',
    rowNumber: 7,
    disposition: 'QUARANTINED',
    targetType: null,
    targetId: null,
    rawValues: { legacyCode: ' ST-1 ' },
    normalizedValues: { legacyCode: 'ST-1' },
  },
};

describe('imports operational client', () => {
  it('strictly validates paginated batches and detail', async () => {
    const detail = {
      ...batch,
      sources: [
        {
          id: 'source-1',
          organizationId: 'org-1',
          batchId: 'batch-1',
          originalName: 'academy.xlsx',
          sha256: 'a'.repeat(64),
          sizeBytes: '1024',
          storedPath: null,
          workbookMeta: { sheets: [] },
          createdAt: '2026-08-11T10:00:00.000Z',
        },
      ],
      dispositions: { READY: 12, QUARANTINED: 1 },
      openIssues: 1,
      reconciliation: [
        {
          id: 'metric-1',
          organizationId: 'org-1',
          batchId: 'batch-1',
          metric: 'source.master_rows',
          dimension: null,
          sourceValue: '13.00',
          targetValue: '12.00',
          difference: '-1.00',
          passed: false,
          createdAt: '2026-08-11T10:02:00.000Z',
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [batch], nextCursor: 'batch-1' }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(detail), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(client.listImportBatches({ status: 'VALIDATED', limit: 25 })).resolves.toEqual({
      items: [batch],
      nextCursor: 'batch-1',
    });
    await expect(client.getImportBatch('batch-1')).resolves.toEqual(detail);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/imports/batches?status=VALIDATED&limit=25');
  });

  it('rejects issue payloads that omit required contract fields', async () => {
    const invalid = { ...issue } as Record<string, unknown>;
    delete invalid.importRowId;
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ items: [invalid], nextCursor: null }), { status: 200 }),
        ),
    );
    await expect(client.listImportIssues('batch-1')).rejects.toMatchObject({
      payload: { code: 'RESPONSE_INVALID' },
    });
  });

  it('rejects malformed privileged row snapshots', async () => {
    const invalid = {
      ...issue,
      row: { ...issue.row, rowNumber: '7' },
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ items: [invalid], nextCursor: null }), { status: 200 }),
        ),
    );

    await expect(client.listImportIssues('batch-1')).rejects.toMatchObject({
      payload: { code: 'RESPONSE_INVALID' },
    });
  });

  it('accepts scoped row snapshots and sends exact issue filters', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ items: [issue], nextCursor: null }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      client.listImportIssues('batch-1', {
        status: 'OPEN',
        severity: 'CRITICAL',
        code: 'PAYMENT_BREAKDOWN_MISMATCH',
        limit: 25,
      }),
    ).resolves.toEqual({ items: [issue], nextCursor: null });
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      'status=OPEN&severity=CRITICAL&code=PAYMENT_BREAKDOWN_MISMATCH&limit=25',
    );
  });

  it('uploads the workbook as multipart with CSRF and no forced content type', async () => {
    const staged = {
      id: 'batch-1',
      status: 'STAGED',
      sha256: 'a'.repeat(64),
      duplicate: false,
      rowCount: 10,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(staged), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      client.uploadImportBatch(new Blob(['xlsx-bytes']), 'academy.xlsx'),
    ).resolves.toEqual(staged);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('file')).toBeInstanceOf(Blob);
    expect(init.headers).toMatchObject({ 'x-csrf-token': 'csrf-import' });
    expect(init.headers).not.toHaveProperty('Content-Type');
  });

  it('uses exact mutation methods and stable-key headers only where required', async () => {
    const metric = {
      metric: 'domain.students',
      sourceValue: 1,
      targetValue: 1,
      difference: 0,
      passed: true,
    };
    const responses = [
      { batchId: 'batch-1', dispositions: { READY: 1 }, openIssues: 0 },
      { batchId: 'batch-1', passed: true, metrics: [metric] },
      { id: 'issue-1', rowId: 'row-1', disposition: 'READY', status: 'RESOLVED' },
      {
        id: 'batch-1',
        status: 'VALIDATED',
        archivedRows: 1,
        resolvedIssues: 2,
        remainingOpenIssues: 0,
      },
      {
        id: 'batch-1',
        status: 'VALIDATED',
        partial: false,
        promotedRows: 1,
        quarantinedRows: 0,
        openIssues: 0,
      },
      { id: 'batch-1', status: 'FINALIZED', metrics: [metric] },
    ];
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(responses.shift()), { status: 200 })),
      );
    vi.stubGlobal('fetch', fetchMock);

    await client.validateImportBatch('batch-1');
    await client.reconcileImportBatch('batch-1');
    await client.resolveImportIssue('batch-1', 'issue-1', {
      schemaVersion: 'plg-import-correction/v1',
      decision: 'CORRECT',
      expectedRowHash: 'a'.repeat(64),
      expectedIssueCode: 'MASTER_CODE_REQUIRED',
      expectedIssueVersion: 1,
      correction: { kind: 'ROW_VALUES', values: { legacyCode: 'ST-1' } },
      note: 'Verified against source workbook',
    });
    await client.archiveImportQuarantine(
      'batch-1',
      { note: 'Owner approved excluding unresolved legacy rows' },
      'archive-key',
    );
    await client.promoteImportReady('batch-1', 'promote-key');
    await client.finalizeImportBatch('batch-1', 'finalize-key');

    const [, validateInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [resolveUrl, resolveInit] = fetchMock.mock.calls[2] as [string, RequestInit];
    const [archiveUrl, archiveInit] = fetchMock.mock.calls[3] as [string, RequestInit];
    const [, promoteInit] = fetchMock.mock.calls[4] as [string, RequestInit];
    const [, finalizeInit] = fetchMock.mock.calls[5] as [string, RequestInit];
    expect(validateInit.headers).not.toHaveProperty('If-Match');
    expect(resolveUrl).toContain('/issues/issue-1');
    expect(resolveInit.method).toBe('PATCH');
    expect(JSON.parse(String(resolveInit.body))).toMatchObject({
      decision: 'CORRECT',
      expectedIssueCode: 'MASTER_CODE_REQUIRED',
    });
    expect(archiveUrl).toContain('/archive-quarantined');
    expect(archiveInit.headers).toMatchObject({ 'idempotency-key': 'archive-key' });
    expect(JSON.parse(String(archiveInit.body))).toEqual({
      note: 'Owner approved excluding unresolved legacy rows',
    });
    expect(promoteInit.headers).toMatchObject({ 'idempotency-key': 'promote-key' });
    expect(finalizeInit.headers).toMatchObject({ 'idempotency-key': 'finalize-key' });
  });
});
