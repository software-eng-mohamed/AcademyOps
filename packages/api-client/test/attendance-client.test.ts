import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  validateAttendanceMutationResult,
  validateAttendanceRosterPage,
  validateAttendanceWindowState,
  validateStableQrTokenResponse,
} from '../src/attendance-validators.js';
import { PlgApiClient } from '../src/client.js';
import { PlgApiError } from '../src/errors.js';

afterEach(() => vi.unstubAllGlobals());

describe('PlgApiClient Attendance Client Methods and Validators', () => {
  const client = new PlgApiClient({ baseUrl: 'http://localhost:3001/api/v1' });

  describe('Attendance Validators Rejection Tests', () => {
    it('validates window state responses with counts', () => {
      const valid = { id: 's-1', state: 'LOCKED', version: 2, rosterCount: 15, absentCount: 3 };
      const res = validateAttendanceWindowState(valid);
      expect(res.rosterCount).toBe(15);
      expect(res.absentCount).toBe(3);
    });

    it('rejects window state response with malformed counts', () => {
      const invalid = { id: 's-1', state: 'LOCKED', version: 2, rosterCount: 'not-a-number' };
      expect(() => validateAttendanceWindowState(invalid)).toThrow(PlgApiError);
    });

    it('rejects invalid window state strings', () => {
      const invalid = { id: 's-1', state: 'INVALID_STATE', version: 2 };
      expect(() => validateAttendanceWindowState(invalid)).toThrow(PlgApiError);
    });

    it('rejects invalid session status in roster page', () => {
      const invalid = {
        session: {
          id: 's-1',
          status: 'INVALID_SESSION_STATUS',
          attendanceWindowState: 'OPEN',
          startsAt: null,
          endsAt: null,
          version: 1,
        },
        items: [],
        nextCursor: null,
      };
      expect(() => validateAttendanceRosterPage(invalid)).toThrow(PlgApiError);
    });

    it('rejects invalid effectiveStatus in roster page item', () => {
      const invalid = {
        session: {
          id: 's-1',
          status: 'SCHEDULED',
          attendanceWindowState: 'OPEN',
          startsAt: null,
          endsAt: null,
          version: 1,
        },
        items: [
          {
            enrollmentId: 'e-1',
            effectiveStatus: 'INVALID_EFFECTIVE_STATUS',
            student: null,
            attendance: null,
          },
        ],
        nextCursor: null,
      };
      expect(() => validateAttendanceRosterPage(invalid)).toThrow(PlgApiError);
    });

    it('rejects invalid status in mutation result', () => {
      const invalid = { id: 'r-1', status: 'INVALID_MUTATION_STATUS', version: 1 };
      expect(() => validateAttendanceMutationResult(invalid)).toThrow(PlgApiError);
    });

    it('validates stable QR token responses', () => {
      const valid = { token: 'STABLE:v1:org:student:sig' };
      const res = validateStableQrTokenResponse(valid);
      expect(res.token).toBe('STABLE:v1:org:student:sig');
    });

    it('rejects stable QR token responses missing token', () => {
      const invalid = { missingToken: true };
      expect(() => validateStableQrTokenResponse(invalid)).toThrow(PlgApiError);
    });
  });

  describe('Client Methods', () => {
    it('sends close request with idempotency-key and If-Match headers', async () => {
      const resData = { id: 's-1', state: 'LOCKED', version: 3, rosterCount: 10, absentCount: 2 };
      const fetchMock = vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(new Response(JSON.stringify(resData), { status: 200 })),
        );
      vi.stubGlobal('fetch', fetchMock);

      const res = await client.closeAttendanceWindow('s-1', 2, 'idem-key-123');
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/sessions/s-1/attendance-window/close',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'If-Match': '2',
            'idempotency-key': 'idem-key-123',
          }),
        }),
      );
      expect(res.rosterCount).toBe(10);
    });

    it('sends scan attendance request with exact POST path, body, and idempotency-key header', async () => {
      const resData = { id: 'r-1', status: 'PRESENT', version: 1 };
      const fetchMock = vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(new Response(JSON.stringify(resData), { status: 200 })),
        );
      vi.stubGlobal('fetch', fetchMock);

      const res = await client.scanAttendance(
        's-1',
        'STABLE:v1:org:student:sig',
        'PRESENT',
        'idem-scan-456',
      );
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/sessions/s-1/attendance/scan',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ token: 'STABLE:v1:org:student:sig', status: 'PRESENT' }),
          headers: expect.objectContaining({
            'idempotency-key': 'idem-scan-456',
          }),
        }),
      );
      expect(res.status).toBe('PRESENT');
      expect(res.version).toBe(1);
    });

    it('links missed and attended records through the make-up endpoint', async () => {
      const fetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              id: 'credit-1',
              missedRecordId: 'missed-1',
              makeupRecordId: 'made-1',
            }),
            { status: 201 },
          ),
        ),
      );
      vi.stubGlobal('fetch', fetchMock);
      await client.createAttendanceMakeup('missed-1', 'made-1', 'makeup-key');
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/attendance/makeup-credits',
        expect.objectContaining({
          body: JSON.stringify({ missedRecordId: 'missed-1', makeupRecordId: 'made-1' }),
          headers: expect.objectContaining({ 'idempotency-key': 'makeup-key' }),
          method: 'POST',
        }),
      );
    });
  });
});
