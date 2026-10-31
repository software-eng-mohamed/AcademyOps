import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlgApiClient } from '../src/client.js';

afterEach(() => vi.unstubAllGlobals());
const client = new PlgApiClient({
  baseUrl: 'http://localhost:3001/api/v1',
  getCsrfToken: () => 'csrf-owner',
});
describe('owner operational client', () => {
  it('validates and paginates students', async () => {
    const result = {
      items: [
        {
          id: 'student-1',
          publicId: 'ST-1',
          name: 'Student',
          birthDate: null,
          gender: null,
          version: 2,
          studentProfile: { id: 'profile-1', portalStatus: 'ACTIVE', version: 1 },
          enrollmentSummary: {
            total: 1,
            active: 1,
            latestState: 'ACTIVE',
            program: null,
            cohort: null,
            branch: null,
          },
        },
      ],
      nextCursor: 'student-1',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(result), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(client.listStudents({ search: 'Student', limit: 25 })).resolves.toEqual(result);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/students?search=Student&limit=25');
  });
  it('sends optimistic versions for transfers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'enrollment-1', state: 'ACTIVE', version: 8 }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await client.transferEnrollment('enrollment-1', 'cohort-2', 'Schedule fit', 7);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/api/v1/enrollments/enrollment-1/transfer');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'If-Match': '7', 'x-csrf-token': 'csrf-owner' });
    expect(JSON.parse(String(init.body))).toEqual({
      targetCohortId: 'cohort-2',
      reason: 'Schedule fit',
    });
  });
  it('sends optimistic versions for cohort lifecycle commands', async () => {
    const cohort = {
      id: 'cohort-1',
      programVersionId: 'pv-1',
      owningBranchId: 'branch-1',
      code: 'C-1',
      name: null,
      status: 'PLANNED',
      startsOn: null,
      endsOn: null,
      capacity: 20,
      version: 4,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(cohort), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await client.transitionCohort('cohort-1', 'plan', 'Ready for delivery', 3);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ 'If-Match': '3' });
  });
  it.each([
    ['postpone', 'postponeEnrollment'],
    ['resume', 'resumeEnrollment'],
    ['complete', 'completeEnrollment'],
  ] as const)('connects the enrollment %s lifecycle command', async (command, method) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'enrollment-1', state: 'ACTIVE', version: 5 }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await client[method]('enrollment-1', 'Lifecycle evidence', 4);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`http://localhost:3001/api/v1/enrollments/enrollment-1/${command}`);
    expect(init.headers).toMatchObject({ 'If-Match': '4' });
    expect(JSON.parse(String(init.body))).toEqual({ reason: 'Lifecycle evidence' });
  });
  it('creates and updates organization lead stages with optimistic versions', async () => {
    const stage = {
      id: 'stage-1',
      code: 'QUALIFIED',
      name: 'Qualified',
      ordinal: 3,
      isActive: true,
      version: 2,
    };
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(stage), { status: 200 })),
      );
    vi.stubGlobal('fetch', fetchMock);
    await client.createLeadStage({
      code: stage.code,
      name: stage.name,
      ordinal: stage.ordinal,
    });
    await client.updateLeadStage(stage.id, { isActive: false }, 2);
    const [updateUrl, updateInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(updateUrl).toContain('/lead-stages/stage-1');
    expect(updateInit.headers).toMatchObject({ 'If-Match': '2' });
  });
  it('requests a retake against a discoverable curriculum line', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'retake-1', status: 'REQUESTED', version: 1 }), {
        status: 201,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await client.requestEnrollmentRetake('enrollment-1', 'version-module-1', 'Repeat assessment');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/enrollments/enrollment-1/retakes');
    expect(JSON.parse(String(init.body))).toEqual({
      programVersionModuleId: 'version-module-1',
      reason: 'Repeat assessment',
    });
  });
});
