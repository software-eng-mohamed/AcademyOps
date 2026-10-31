import { expect, it } from 'vitest';
import { z } from 'zod';
import { StableQrScanService } from '../../src/attendance/stable-qr-scan.service';
import { get, patch, post } from './finance-http-client';
import { runHttpScenario } from './http-test-harness';
import {
  attendanceFixture,
  databaseDescribe,
  headers,
  recordSchema,
  responseBody,
} from './attendance-role-http-support';

databaseDescribe('Attendance role end-to-end with shipped grants', () => {
  it('opens, records once, corrects with history, finalizes absences, and forbids correction after lock', async () => {
    await runHttpScenario({ permissions: [], roleCode: 'ATTENDANCE' }, async (context) => {
      const f = await attendanceFixture(context);
      const path = `sessions/${f.sessionId}`;
      const manual = {
        enrollmentId: f.enrollmentId,
        status: 'PRESENT',
        reason: 'Verified synthetic attendance',
      };
      expect(
        await responseBody(
          await post(context, `${path}/attendance/manual`, manual, headers()),
          409,
        ),
      ).toMatchObject({ code: 'MANUAL_ATTENDANCE_WINDOW_INVALID' });
      expect(
        await responseBody(
          await post(context, `${path}/attendance-window/open`, undefined, headers()),
          201,
        ),
      ).toMatchObject({ state: 'OPEN', version: 2 });
      const key = headers();
      const marked = recordSchema.parse(
        await responseBody(await post(context, `${path}/attendance/manual`, manual, key), 201),
      );
      expect(marked).toMatchObject({ status: 'PRESENT', version: 1 });
      expect(
        await responseBody(await post(context, `${path}/attendance/manual`, manual, key), 201),
      ).toEqual(marked);
      expect(
        await responseBody(
          await post(
            context,
            `${path}/attendance/manual`,
            { ...manual, status: 'LATE' },
            headers(),
          ),
          409,
        ),
      ).toMatchObject({ code: 'ATTENDANCE_ALREADY_RECORDED' });
      const correction = { status: 'LATE', reason: 'Checked actual arrival time' };
      const correctionKey = headers();
      const corrected = recordSchema.parse(
        await responseBody(
          await post(context, `attendance/${marked.id}/corrections`, correction, correctionKey),
          201,
        ),
      );
      expect(corrected).toMatchObject({ status: 'LATE', version: 2 });
      expect(
        await responseBody(
          await post(context, `attendance/${marked.id}/corrections`, correction, correctionKey),
          201,
        ),
      ).toEqual(corrected);
      await responseBody(
        await post(
          context,
          `attendance/${marked.id}/corrections`,
          { status: 'EXCUSED', reason: 'Stale version' },
          headers(),
        ),
        409,
      );
      const detail = z
        .object({ events: z.array(z.unknown()) })
        .parse(await responseBody(await get(context, `attendance/${marked.id}`), 200));
      expect(detail.events).toHaveLength(2);
      expect(
        await responseBody(
          await get(context, `enrollments/${f.enrollmentId}/attendance-summary`),
          200,
        ),
      ).toMatchObject({ denominator: 1 });
      const overview = await responseBody(
        await get(context, 'dashboard/workspaces/ATTENDANCE'),
        200,
      );
      expect(JSON.stringify(overview)).toContain('LATE');
      const closeKey = headers(2);
      const closed = await responseBody(
        await post(context, `${path}/attendance-window/close`, undefined, closeKey),
        200,
      );
      expect(closed).toMatchObject({ state: 'LOCKED', version: 3, rosterCount: 2, absentCount: 1 });
      expect(
        await responseBody(
          await post(context, `${path}/attendance-window/close`, undefined, closeKey),
          200,
        ),
      ).toEqual(closed);
      const absent = await context.prisma.attendanceRecord.findFirstOrThrow({
        where: { sessionId: f.sessionId, enrollmentId: f.secondEnrollmentId },
      });
      expect(absent).toMatchObject({ currentStatus: 'ABSENT', source: 'SYSTEM_CLOSE' });
      await responseBody(
        await post(context, `attendance/${marked.id}/corrections`, correction, headers(2)),
        404,
      );
      await responseBody(
        await post(
          context,
          'attendance/makeup-credits',
          { missedRecordId: absent.id, makeupRecordId: marked.id },
          headers(),
        ),
        403,
      );
      expect(
        await context.prisma.attendanceRecord.count({ where: { sessionId: f.sessionId } }),
      ).toBe(2);
      expect(await responseBody(await get(context, `${path}/attendance`), 200)).toMatchObject({
        session: { attendanceWindowState: 'LOCKED' },
      });
    });
  });
  it('validates QR scans, prevents duplicate/overwrite, and creates expiring session challenges', async () => {
    await runHttpScenario({ permissions: [], roleCode: 'ATTENDANCE' }, async (context) => {
      const f = await attendanceFixture(context);
      const path = `sessions/${f.sessionId}`;
      await responseBody(
        await post(context, `${path}/attendance-window/open`, undefined, headers()),
        201,
      );
      const qr = z
        .object({ token: z.string(), expiresAt: z.string() })
        .parse(await responseBody(await post(context, `${path}/qr-challenges`), 201));
      expect(qr.token.length).toBeGreaterThan(20);
      expect(Date.parse(qr.expiresAt)).toBeGreaterThan(Date.now());
      expect(
        await responseBody(
          await post(
            context,
            `${path}/attendance/scan`,
            { token: 'invalid', status: 'PRESENT' },
            headers(),
          ),
          403,
        ),
      ).toMatchObject({ code: 'INVALID_STUDENT_QR_TOKEN' });
      const service = context.app.get(StableQrScanService);
      const token = service.generateToken(context.organizationId, f.studentPersonId);
      const key = headers();
      const scanned = recordSchema.parse(
        await responseBody(
          await post(context, `${path}/attendance/scan`, { token, status: 'LATE' }, key),
          200,
        ),
      );
      expect(scanned).toMatchObject({ status: 'LATE', version: 1 });
      expect(
        await responseBody(
          await post(context, `${path}/attendance/scan`, { token, status: 'LATE' }, key),
          200,
        ),
      ).toEqual(scanned);
      expect(
        await responseBody(
          await post(context, `${path}/attendance/scan`, { token, status: 'PRESENT' }, headers()),
          200,
        ),
      ).toEqual(scanned);
      const outsideToken = service.generateToken(context.organizationId, context.personId);
      expect(
        await responseBody(
          await post(
            context,
            `${path}/attendance/scan`,
            { token: outsideToken, status: 'PRESENT' },
            headers(),
          ),
          409,
        ),
      ).toMatchObject({ code: 'NOT_IN_SESSION_ROSTER' });
      await responseBody(
        await post(context, `${path}/attendance/scan`, { token, status: 'ABSENT' }, headers()),
        400,
      );
      expect(
        await context.prisma.attendanceRecord.count({ where: { sessionId: f.sessionId } }),
      ).toBe(1);
      expect(
        await responseBody(await get(context, `${path}/attendance-anomalies`), 200),
      ).toMatchObject({ items: [] });
      await responseBody(
        await post(context, `${path}/attendance-window/close`, undefined, headers(2)),
        200,
      );
      expect(
        await responseBody(
          await post(context, `${path}/attendance/scan`, { token, status: 'LATE' }, headers()),
          409,
        ),
      ).toMatchObject({ code: 'ATTENDANCE_WINDOW_NOT_OPEN' });
    });
  });
  it('keeps students and catalog read-only, denies money/contact/self-service, and isolates record scopes', async () => {
    await runHttpScenario({ permissions: [], roleCode: 'ATTENDANCE' }, async (context) => {
      const f = await attendanceFixture(context);
      const student = await responseBody(await get(context, `students/${f.studentPersonId}`), 200);
      expect(student).toMatchObject({ contacts: [] });
      for (const path of [
        'students',
        'enrollments',
        'programs',
        'cohorts',
        'rooms',
        'trainers',
        'sessions',
      ])
        await responseBody(await get(context, path), 200);
      for (const path of [
        'students',
        'enrollments',
        'programs',
        'cohorts',
        'sessions',
        'payments',
        'attendance-policies',
        'certificates/issue',
      ])
        await responseBody(await post(context, path, {}, headers()), 403);
      await responseBody(
        await patch(
          context,
          `students/${f.studentPersonId}`,
          { name: 'Unauthorized update' },
          headers(),
        ),
        403,
      );
      for (const path of [
        'payments',
        'leads',
        'business-accounts',
        'certificates',
        'attendance/self-token',
        'attendance-policies',
        `enrollments/${f.enrollmentId}/finance-summary`,
      ])
        await responseBody(await get(context, path), 403);
      await responseBody(await get(context, `students/${f.foreignStudentPersonId}`), 404);
      const outside = await context.prisma.branch.create({
        data: {
          organizationId: context.organizationId,
          code: 'OUTSIDE',
          name: 'Scope isolation fixture',
        },
      });
      await context.prisma.cohort.update({
        where: { id: f.cohortId },
        data: { owningBranchId: outside.id },
      });
      await responseBody(await get(context, `sessions/${f.sessionId}/attendance`), 404);
      await responseBody(
        await post(context, `sessions/${f.sessionId}/attendance-window/open`, undefined, headers()),
        404,
      );
    });
  });
});
