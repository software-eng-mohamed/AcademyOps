import { expect, it } from 'vitest';
import { z } from 'zod';
import { StableQrScanService } from '../../src/attendance/stable-qr-scan.service';
import {
  databaseDescribe,
  headers,
  recordSchema,
  responseBody,
} from './attendance-role-http-support';
import { get, post } from './finance-http-client';
import { runHttpScenario } from './http-test-harness';
import { trainerFixture } from './trainer-role-http-support';

databaseDescribe('Trainer attendance with actual assignment-only grants', () => {
  it('opens assigned attendance, records and corrects once, then locks with auditable absences', async () => {
    await runHttpScenario({ permissions: [], roleCode: 'TRAINER' }, async (context) => {
      const f = await trainerFixture(context);
      const path = `sessions/${f.sessionId}`;
      await responseBody(
        await post(context, `${path}/attendance-window/open`, undefined, headers()),
        201,
      );
      const key = headers();
      const input = {
        enrollmentId: f.enrollmentId,
        status: 'PRESENT',
        reason: 'Synthetic trainer check',
      };
      const recorded = recordSchema.parse(
        await responseBody(await post(context, `${path}/attendance/manual`, input, key), 201),
      );
      expect(
        await responseBody(await post(context, `${path}/attendance/manual`, input, key), 201),
      ).toEqual(recorded);
      const correction = { status: 'LATE', reason: 'Verified arrival time' };
      expect(
        await responseBody(
          await post(context, `attendance/${recorded.id}/corrections`, correction, headers()),
          201,
        ),
      ).toMatchObject({ version: 2, status: 'LATE' });
      await responseBody(
        await post(context, `attendance/${recorded.id}/corrections`, correction, headers()),
        409,
      );
      expect(await responseBody(await get(context, `${path}/attendance`), 200)).toMatchObject({
        session: { attendanceWindowState: 'OPEN' },
      });
      expect(
        await responseBody(
          await post(context, `${path}/attendance-window/close`, undefined, headers(2)),
          200,
        ),
      ).toMatchObject({ state: 'LOCKED', rosterCount: 2, absentCount: 1 });
      await responseBody(
        await post(context, `attendance/${recorded.id}/corrections`, correction, headers(2)),
        404,
      );
      expect(
        await context.prisma.attendanceEvent.count({ where: { attendanceRecordId: recorded.id } }),
      ).toBe(2);
    });
  }, 15_000);
  it('validates QR tokens and replay, refuses another trainer session and outside roster', async () => {
    await runHttpScenario({ permissions: [], roleCode: 'TRAINER' }, async (context) => {
      const f = await trainerFixture(context);
      const path = `sessions/${f.sessionId}`;
      for (const id of [f.otherSessionId, f.peerSessionId]) {
        await responseBody(await get(context, `sessions/${id}/attendance`), 404);
        await responseBody(
          await post(context, `sessions/${id}/attendance-window/open`, undefined, headers()),
          404,
        );
        await responseBody(await post(context, `sessions/${id}/qr-challenges`), 404);
      }
      await responseBody(
        await post(context, `${path}/attendance-window/open`, undefined, headers()),
        201,
      );
      const challenge = z
        .object({ token: z.string(), expiresAt: z.string() })
        .parse(await responseBody(await post(context, `${path}/qr-challenges`), 201));
      expect(Date.parse(challenge.expiresAt)).toBeGreaterThan(Date.now());
      const service = context.app.get(StableQrScanService);
      const token = service.generateToken(context.organizationId, f.studentPersonId);
      const input = { token, status: 'PRESENT' };
      const key = headers();
      const scanned = await responseBody(
        await post(context, `${path}/attendance/scan`, input, key),
        200,
      );
      expect(
        await responseBody(await post(context, `${path}/attendance/scan`, input, key), 200),
      ).toEqual(scanned);
      expect(
        await responseBody(
          await post(
            context,
            `${path}/attendance/scan`,
            { token: 'bad', status: 'PRESENT' },
            headers(),
          ),
          403,
        ),
      ).toMatchObject({ code: 'INVALID_STUDENT_QR_TOKEN' });
      const outsideToken = service.generateToken(context.organizationId, f.other.studentPersonId);
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
      await responseBody(await get(context, `${path}/attendance-anomalies`), 200);
    });
  });
});
