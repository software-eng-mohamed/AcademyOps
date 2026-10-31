import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeAcademyAction } from '@/api/academy/commands';
import { getLookupPage } from '@/api/academy/lookups';
import type { AcademyRecord, AcademyResource } from '@/api/academy/models';
import { getAcademyPage } from '@/api/academy/queries';
import type { AcademyAction, ActionTarget, CurriculumEntry } from '@/features/academy/actions';

const row: AcademyRecord = {
  id: 'record-1',
  name: 'Existing record',
  code: 'EXISTING',
  status: 'ACTIVE',
  version: 4,
  data: { personId: 'person-1' },
};
const values = {
  name: ' Updated name ',
  code: 'NEW-CODE',
  reason: 'Confirmed by owner',
  note: 'Conversation details',
  userId: 'user-1',
  ordinal: '2',
  capacity: '25',
  email: 'student@example.com',
  phone: '+201001234567',
  kind: 'INDIVIDUAL',
  cohortId: 'cohort-1',
  studentPersonId: 'person-1',
  programVersionId: 'version-1',
  programVersionModuleId: 'curriculum-module-1',
  targetCohortId: 'cohort-2',
  targetPersonId: 'person-2',
  effectiveFrom: '2026-10-01',
  verificationReference: 'PROOF-2026-001',
  type: 'CALL',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function run(target: ActionTarget, overrides: Record<string, string> = {}) {
  return executeAcademyAction({
    target,
    values: { ...values, ...overrides },
    branchId: 'branch-1',
    idempotencyKey: 'academy-test-request',
    curriculum: [{ moduleId: 'module-1', required: true, key: 'editor-key-1' } as CurriculumEntry],
    contacts: [{ type: 'EMAIL', value: 'student@example.com', isPrimary: true }],
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('academy generated-client command wiring', () => {
  it.each<[AcademyResource, AcademyAction, string, string]>([
    ['leads', 'create', '/api/v1/leads', 'POST'],
    ['leads', 'edit', '/api/v1/leads/record-1', 'PATCH'],
    ['leads', 'claim', '/api/v1/leads/record-1/claim', 'POST'],
    ['leads', 'assign', '/api/v1/leads/record-1/assign', 'POST'],
    ['leads', 'open', '/api/v1/leads/record-1/open', 'POST'],
    ['leads', 'qualify', '/api/v1/leads/record-1/qualify', 'POST'],
    ['leads', 'lose', '/api/v1/leads/record-1/lose', 'POST'],
    ['leads', 'disqualify', '/api/v1/leads/record-1/disqualify', 'POST'],
    ['leads', 'reopen', '/api/v1/leads/record-1/reopen', 'POST'],
    ['leads', 'addActivity', '/api/v1/leads/record-1/activities', 'POST'],
    ['students', 'create', '/api/v1/students', 'POST'],
    ['students', 'edit', '/api/v1/students/record-1', 'PATCH'],
    ['students', 'editContacts', '/api/v1/students/record-1/contacts', 'PUT'],
    ['registrations', 'approve', '/api/v1/student-registrations/record-1/approve', 'POST'],
    ['registrations', 'reject', '/api/v1/student-registrations/record-1/reject', 'POST'],
    ['enrollments', 'submit', '/api/v1/enrollments/record-1/submit', 'POST'],
    ['enrollments', 'activate', '/api/v1/enrollments/record-1/activate', 'POST'],
    ['enrollments', 'reject', '/api/v1/enrollments/record-1/reject', 'POST'],
    ['enrollments', 'transfer', '/api/v1/enrollments/record-1/transfer', 'POST'],
    ['enrollments', 'postpone', '/api/v1/enrollments/record-1/postpone', 'POST'],
    ['enrollments', 'resume', '/api/v1/enrollments/record-1/resume', 'POST'],
    ['enrollments', 'complete', '/api/v1/enrollments/record-1/complete', 'POST'],
    [
      'enrollments',
      'requestCancellation',
      '/api/v1/enrollments/record-1/cancellation-requests',
      'POST',
    ],
    [
      'enrollments',
      'approveCancellation',
      '/api/v1/enrollment-cancellation-requests/record-1/approve',
      'POST',
    ],
    [
      'enrollments',
      'rejectCancellation',
      '/api/v1/enrollment-cancellation-requests/record-1/reject',
      'POST',
    ],
    ['enrollments', 'retake', '/api/v1/enrollments/record-1/retakes', 'POST'],
    ['enrollments', 'approveRetake', '/api/v1/module-retakes/record-1/approve', 'POST'],
    ['enrollments', 'rejectRetake', '/api/v1/module-retakes/record-1/reject', 'POST'],
    ['programs', 'create', '/api/v1/programs', 'POST'],
    ['programs', 'edit', '/api/v1/programs/record-1', 'PATCH'],
    ['programs', 'archive', '/api/v1/programs/record-1', 'PATCH'],
    ['programs', 'restore', '/api/v1/programs/record-1', 'PATCH'],
    ['programs', 'createVersion', '/api/v1/programs/record-1/versions', 'POST'],
    ['versions', 'replaceCurriculum', '/api/v1/program-versions/record-1/curriculum', 'PUT'],
    ['versions', 'publish', '/api/v1/program-versions/record-1/publish', 'POST'],
    ['versions', 'archive', '/api/v1/program-versions/record-1/archive', 'POST'],
    ['cohorts', 'create', '/api/v1/cohorts', 'POST'],
    ['cohorts', 'edit', '/api/v1/cohorts/record-1', 'PATCH'],
    ['cohorts', 'plan', '/api/v1/cohorts/record-1/plan', 'POST'],
    ['cohorts', 'activate', '/api/v1/cohorts/record-1/activate', 'POST'],
    ['cohorts', 'complete', '/api/v1/cohorts/record-1/complete', 'POST'],
    ['cohorts', 'cancelCohort', '/api/v1/cohorts/record-1/cancel', 'POST'],
    ['rooms', 'create', '/api/v1/rooms', 'POST'],
    ['rooms', 'edit', '/api/v1/rooms/record-1', 'PATCH'],
    ['rooms', 'deactivate', '/api/v1/rooms/record-1', 'PATCH'],
    ['trainers', 'create', '/api/v1/trainers', 'POST'],
    ['trainers', 'edit', '/api/v1/trainers/record-1', 'PATCH'],
    ['trainers', 'enable', '/api/v1/trainers/record-1', 'PATCH'],
    ['modules', 'create', '/api/v1/modules', 'POST'],
    ['modules', 'edit', '/api/v1/modules/record-1', 'PATCH'],
    ['modules', 'enable', '/api/v1/modules/record-1', 'PATCH'],
    ['stages', 'create', '/api/v1/lead-stages', 'POST'],
    ['stages', 'edit', '/api/v1/lead-stages/record-1', 'PATCH'],
    ['stages', 'deactivate', '/api/v1/lead-stages/record-1', 'PATCH'],
  ])('%s / %s uses its generated endpoint once', async (resource, action, url, method) => {
    const fetchMock = vi.fn(async () => json({ id: 'record-1', version: 5 }));
    vi.stubGlobal('fetch', fetchMock);
    await run({ resource, action, ...(action === 'create' ? {} : { row }) });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(url, expect.objectContaining({ method }));
  });

  it('sends actual record versions, not curriculum version numbers, with exact editor payloads', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => json({ id: 'record-1' }));
    vi.stubGlobal('fetch', fetchMock);
    await run({ resource: 'versions', action: 'replaceCurriculum', row: { ...row, version: 11 } });
    const init = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get('if-match')).toBe('11');
    expect(JSON.parse(String(init?.body))).toEqual({
      modules: [{ moduleId: 'module-1', required: true, ordinal: 1 }],
    });
  });

  it('preserves optional contact fields on create and replaces contacts with only API fields', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => json({ id: 'record-1' }));
    vi.stubGlobal('fetch', fetchMock);
    await run({ resource: 'students', action: 'create' });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1].body))).toMatchObject({
      name: 'Updated name',
      branchId: 'branch-1',
      email: 'student@example.com',
      phone: '+201001234567',
    });
    await run({ resource: 'students', action: 'editContacts', row });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1].body))).toEqual({
      contacts: [{ type: 'EMAIL', value: 'student@example.com', isPrimary: true }],
    });
  });
  it('sends Academy wall-clock values as Cairo instants', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      json({ id: 'record-1', version: 5 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await run({ resource: 'leads', action: 'create' }, { nextActionAt: '2026-09-08T18:00' });
    await run(
      { resource: 'leads', action: 'addActivity', row },
      { occurredAt: '2026-01-15T18:00' },
    );
    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init.body)));
    expect(bodies).toEqual([
      expect.objectContaining({ nextActionAt: '2026-09-08T15:00:00.000Z' }),
      expect.objectContaining({ occurredAt: '2026-01-15T16:00:00.000Z' }),
    ]);
  });
  it('loads the cohort version and branch before creating an enrollment', async () => {
    const fetchMock = vi.fn(async (url: string, _init: RequestInit) =>
      json(
        url.includes('/cohorts/')
          ? { id: 'cohort-1', programVersionId: 'published-1', owningBranchId: 'cohort-branch' }
          : { id: 'new-enrollment' },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    await run({ resource: 'enrollments', action: 'create' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1].body))).toMatchObject({
      studentPersonId: 'person-1',
      cohortId: 'cohort-1',
      programVersionId: 'published-1',
      homeBranchId: 'cohort-branch',
    });
  });

  it('uses a fresh target version and an idempotency key for student merges', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) =>
      json(init.method === 'GET' ? { id: 'person-2', version: 8 } : { id: 'person-2' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await run({ resource: 'students', action: 'merge', row });
    const init = fetchMock.mock.calls[1]?.[1];
    expect(JSON.parse(String(init?.body))).toEqual({
      targetPersonId: 'person-2',
      targetVersion: 8,
      reason: 'Confirmed by owner',
    });
    expect(new Headers(init?.headers).get('idempotency-key')).toBe('academy-test-request');
    expect(new Headers(init?.headers).get('if-match')).toBe('4');
  });

  it('converts a lead using its existing person and a published cohort context', async () => {
    const fetchMock = vi.fn(async (url: string, _init: RequestInit) =>
      json(
        url.includes('/cohorts/')
          ? { id: 'cohort-1', programVersionId: 'version-1', owningBranchId: 'branch-1' }
          : { id: 'new-enrollment' },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    await run({ resource: 'leads', action: 'win', row });
    const init = fetchMock.mock.calls[1]?.[1];
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/v1/leads/record-1/win');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      personId: 'person-1',
      cohortId: 'cohort-1',
      programVersionId: 'version-1',
      homeBranchId: 'branch-1',
    });
    expect(new Headers(init?.headers).get('idempotency-key')).toBe('academy-test-request');
    expect(new Headers(init?.headers).get('if-match')).toBe('4');
  });

  it('limits retake target options to the selected curriculum module', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({
          id: 'cohort-1',
          modules: [
            {
              id: 'target-1',
              programVersionModuleId: 'source-1',
              module: { name: 'HR Fundamentals' },
            },
            {
              id: 'target-2',
              programVersionModuleId: 'source-2',
              module: { name: 'Unrelated module' },
            },
          ],
        }),
      ),
    );
    const options = await getLookupPage('cohortModules', '', undefined, {
      cohortId: 'cohort-1',
      programVersionModuleId: 'source-1',
    });
    expect(options.items).toEqual([{ value: 'target-1', label: 'HR Fundamentals' }]);
  });

  it('does not repeat a failed command and refuses missing concurrency versions', async () => {
    const fetchMock = vi.fn(async () =>
      json({ code: 'INTERNAL_ERROR', messageKey: 'errors.internal' }, 500),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(run({ resource: 'programs', action: 'edit', row })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(
      run({ resource: 'programs', action: 'edit', row: { ...row, version: Number.NaN } }),
    ).rejects.toThrow('Record version is required');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('academy list contracts', () => {
  it('uses numeric pagination and server-side filters without invented totals', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      json({ items: [{ id: 'lead-1', name: 'Lead', version: 1 }], nextCursor: 'lead-1' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await getAcademyPage('leads', {
      status: 'OPEN',
      search: '  Ada  ',
      cursor: 'cursor-1',
    });
    const url = fetchMock.mock.calls[0]?.[0] ?? '';
    expect(url).toContain('limit=25');
    expect(url).toContain('state=OPEN');
    expect(url).toContain('search=Ada');
    expect(url).toContain('cursor=cursor-1');
    expect(result.nextCursor).toBe('lead-1');
    expect(result.total).toBeUndefined();
  });
});
