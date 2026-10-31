import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAttendancePolicy,
  createMakeupCredit,
  findSessionAttendance,
  scanAttendance,
} from '@/api/management/attendance';
import { executeManagementAction } from '@/api/management/commands';
import { getManagementDetail } from '@/api/management/queries';

const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('Operations command adapters', () => {
  it('reloads the current roster version instead of reusing stale detail data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({
          session: { id: 'session', attendanceWindowState: 'LOCKED' },
          items: [
            {
              enrollmentId: 'enrollment',
              student: { name: 'Student' },
              effectiveStatus: 'ABSENT',
              attendance: { id: 'record', version: 2, status: 'ABSENT' },
            },
          ],
          nextCursor: null,
        }),
      ),
    );
    const detail = await getManagementDetail('roster', {
      id: 'enrollment',
      name: 'Student',
      code: '',
      status: 'PRESENT',
      version: 1,
      data: {
        enrollmentId: 'enrollment',
        session: { id: 'session' },
        attendance: { id: 'record', version: 1 },
      },
    });
    expect(detail.status).toBe('ABSENT');
    expect(detail.data.attendance).toMatchObject({ id: 'record', version: 2 });
  });
  it.each([
    '[]',
    JSON.stringify([
      { trainerId: 'trainer-1', role: 'PRIMARY', label: 'Trainer label', uiKey: 'local-only' },
    ]),
  ])('sends explicit trainer replacements without display-only fields: %s', async (trainers) => {
    const request = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      json({ id: 'session', version: 2 }),
    );
    vi.stubGlobal('fetch', request);
    await executeManagementAction(
      {
        resource: 'sessions',
        action: 'reschedule',
        row: {
          id: 'session',
          name: 'Session',
          code: '',
          status: 'SCHEDULED',
          version: 1,
          data: {},
        },
      },
      {
        startsAt: '2026-09-06T10:00',
        endsAt: '2026-09-06T11:00',
        reason: 'Change the trainer',
        trainers,
      },
      'key',
    );
    const payload = JSON.parse(String(request.mock.calls[0]?.[1]?.body));
    expect(payload.trainers).toEqual(
      JSON.parse(trainers).map(({ trainerId, role }: { trainerId: string; role: string }) => ({
        trainerId,
        role,
      })),
    );
    expect(JSON.stringify(payload)).not.toContain('local-only');
  });
  it('keeps numeric policy fields numeric on the wire', async () => {
    const request = vi.fn(async () => json({ id: 'policy' }));
    vi.stubGlobal('fetch', request);
    const value = {
      programVersionId: 'version',
      minimumRatio: 0.85,
      lockAfterMinutes: 1440,
      checkInOpensBeforeMinutes: 0,
      checkInClosesAfterMinutes: 30,
      effectiveFrom: '2026-09-05T00:00:00Z',
    };
    await createAttendancePolicy(value, 'policy-key');
    expect(request).toHaveBeenCalledWith(
      '/api/v1/attendance-policies',
      expect.objectContaining({ body: JSON.stringify(value) }),
    );
  });
  it('scans trimmed tokens with an idempotency key and rejects empty tokens without a request', async () => {
    const request = vi.fn(async () => json({ id: 'record' }));
    vi.stubGlobal('fetch', request);
    await expect(scanAttendance('session', ' ', 'PRESENT', 'key')).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
    await scanAttendance('session', ' SYNTHETIC ', 'LATE', 'scan-key');
    expect(request).toHaveBeenCalledWith(
      '/api/v1/sessions/session/attendance/scan',
      expect.objectContaining({ body: JSON.stringify({ token: 'SYNTHETIC', status: 'LATE' }) }),
    );
  });
  it('requires two distinct attendance records before a make-up request', async () => {
    const request = vi.fn(async () => json({ id: 'credit' }));
    vi.stubGlobal('fetch', request);
    await expect(createMakeupCredit('same', 'same', 'key')).rejects.toThrow();
    await expect(createMakeupCredit('', 'attended', 'key')).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
    await createMakeupCredit('missed', 'attended', 'key');
    expect(request).toHaveBeenCalledWith(
      '/api/v1/attendance/makeup-credits',
      expect.objectContaining({
        body: JSON.stringify({ missedRecordId: 'missed', makeupRecordId: 'attended' }),
      }),
    );
  });
  it('finds a make-up candidate beyond the first roster page', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(json({ items: [{ enrollmentId: 'other' }], nextCursor: 'next' }))
      .mockResolvedValueOnce(
        json({
          items: [{ enrollmentId: 'target', attendance: { id: 'record', status: 'LATE' } }],
          nextCursor: null,
        }),
      );
    vi.stubGlobal('fetch', request);
    await expect(findSessionAttendance('session', 'target')).resolves.toEqual({
      id: 'record',
      status: 'LATE',
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]?.[0]).toContain('cursor=next');
  });
  it('stops on a repeated roster cursor instead of looping', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ items: [], nextCursor: 'same' })),
    );
    await expect(findSessionAttendance('session', 'target')).rejects.toThrow(
      'Repeated attendance cursor',
    );
  });
});
