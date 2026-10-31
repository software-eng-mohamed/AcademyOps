import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { FileStorageService } from '../../src/platform/files/file-storage.service';
import { databaseDescribe, headers, responseBody } from './attendance-role-http-support';
import { get, patch, post } from './finance-http-client';
import { runHttpScenario } from './http-test-harness';
import { trainerCertificate, trainerFixture } from './trainer-role-http-support';

const page = z.object({ items: z.array(z.object({ id: z.string() }).passthrough()) });
const ids = (body: unknown) => page.parse(body).items.map(({ id }) => id);

databaseDescribe('Trainer workspace with actual assignment-only grants', () => {
  it('reads certificates for taught enrollments only and cannot issue or collect them', async () => {
    await runHttpScenario({ permissions: [], roleCode: 'TRAINER' }, async (context) => {
      const f = await trainerFixture(context);
      const own = await trainerCertificate(
        context,
        f.enrollmentId,
        f.programVersionId,
        f.sessionId,
      );
      const other = await trainerCertificate(
        context,
        f.other.secondEnrollmentId,
        f.other.programVersionId,
        f.otherSessionId,
      );
      expect(ids(await responseBody(await get(context, 'certificates'), 200))).toEqual([own.id]);
      expect(await responseBody(await get(context, `certificates/${own.id}`), 200)).toMatchObject({
        id: own.id,
        student: { id: f.studentPersonId },
      });
      await responseBody(await get(context, `certificates/${other.id}`), 404);
      await responseBody(
        await get(context, `certificates?enrollmentId=${f.other.secondEnrollmentId}`),
        404,
      );
      await responseBody(
        await get(context, `certificates/enrollments/${f.enrollmentId}/evaluations`),
        200,
      );
      expect(
        await responseBody(await get(context, `certificates/${own.id}/download`), 409),
      ).toMatchObject({ code: 'CERTIFICATE_PDF_NOT_AVAILABLE' });
      await responseBody(await post(context, `certificates/${own.id}/collect`, {}, headers()), 403);
      const storage = context.app.get(FileStorageService);
      const storageKey = `trainer-qa/${own.id}.pdf`;
      const bytes = Buffer.from('%PDF-1.4\n% Synthetic certificate download test\n%%EOF');
      await storage.putPrivate(storageKey, bytes, 'application/pdf');
      try {
        const asset = await context.prisma.fileAsset.create({
          data: {
            organizationId: context.organizationId,
            storageKey,
            contentType: 'application/pdf',
            sizeBytes: BigInt(bytes.length),
            sha256: createHash('sha256').update(bytes).digest('hex'),
            scanStatus: 'CLEAN',
            classification: 'PRIVATE',
            createdBy: context.userId,
          },
        });
        await context.prisma.certificate.update({
          where: { id: own.id },
          data: { pdfStatus: 'AVAILABLE', fileAssetId: asset.id, version: { increment: 1 } },
        });
        const download = z
          .object({ url: z.string(), expiresAt: z.string() })
          .parse(await responseBody(await get(context, `certificates/${own.id}/download`), 200));
        expect(Date.parse(download.expiresAt)).toBeGreaterThan(Date.now());
        const url = new URL(download.url);
        const response = await fetch(`${context.baseUrl}${url.pathname}${url.search}`);
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('application/pdf');
        expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
        await responseBody(await get(context, `certificates/${other.id}/download`), 404);
      } finally {
        await storage.deletePrivate(storageKey);
      }
    });
  });
  it('shows only taught sessions, their cohorts/students/enrollments, and published catalog', async () => {
    await runHttpScenario({ permissions: [], roleCode: 'TRAINER' }, async (context) => {
      const f = await trainerFixture(context);
      expect(ids(await responseBody(await get(context, 'sessions'), 200))).toEqual([f.sessionId]);
      expect(ids(await responseBody(await get(context, 'cohorts'), 200))).toEqual([f.cohortId]);
      expect(ids(await responseBody(await get(context, 'programs?status=ARCHIVED'), 200))).toEqual(
        [],
      );
      expect(
        ids(await responseBody(await get(context, 'programs?status=ACTIVE'), 200)),
      ).toHaveLength(2);
      expect(ids(await responseBody(await get(context, 'enrollments'), 200))).toEqual(
        expect.arrayContaining([f.enrollmentId, f.secondEnrollmentId]),
      );
      expect(ids(await responseBody(await get(context, 'enrollments'), 200))).not.toContain(
        f.other.secondEnrollmentId,
      );
      const students = ids(await responseBody(await get(context, 'students'), 200));
      expect(students).toContain(f.studentPersonId);
      expect(students).not.toContain(f.other.studentPersonId);
      for (const path of [
        'programs',
        'modules',
        `cohorts/${f.cohortId}`,
        `enrollments/${f.enrollmentId}`,
        `sessions/${f.sessionId}`,
        `enrollments/${f.enrollmentId}/attendance-summary`,
      ])
        await responseBody(await get(context, path), 200);
      for (const path of [
        `sessions/${f.otherSessionId}`,
        `sessions/${f.peerSessionId}`,
        `cohorts/${f.other.cohortId}`,
        `students/${f.other.studentPersonId}`,
        `students/${f.foreignStudentPersonId}`,
        `enrollments/${f.other.secondEnrollmentId}`,
      ])
        await responseBody(await get(context, path), 404);
      expect(
        ids(await responseBody(await get(context, `sessions?cohortId=${f.other.cohortId}`), 200)),
      ).toEqual([]);
    });
  });
  it('restricts room counts and trainer resources to the assignment, including filtered lists', async () => {
    await runHttpScenario({ permissions: [], roleCode: 'TRAINER' }, async (context) => {
      const f = await trainerFixture(context);
      const rooms = page.parse(await responseBody(await get(context, 'rooms'), 200));
      expect(rooms.items).toHaveLength(1);
      expect(rooms.items[0]).toMatchObject({ id: f.roomId, scheduledSessions: 1, cohortCount: 1 });
      expect(ids(await responseBody(await get(context, 'rooms?search=Unassigned'), 200))).toEqual(
        [],
      );
      expect(ids(await responseBody(await get(context, 'trainers'), 200))).toEqual([f.trainerId]);
      await responseBody(await get(context, `trainers/${f.trainerId}`), 200);
      await responseBody(await get(context, `trainers/${f.otherTrainerId}`), 404);
      expect(ids(await responseBody(await get(context, 'trainers?search=Other'), 200))).toEqual([]);
    });
  });
  it('does not include contact details, money or administrative mutation authority', async () => {
    await runHttpScenario({ permissions: [], roleCode: 'TRAINER' }, async (context) => {
      const f = await trainerFixture(context);
      expect(
        await responseBody(await get(context, `students/${f.studentPersonId}`), 200),
      ).toMatchObject({ contacts: [] });
      const enrollment = await responseBody(
        await get(context, `enrollments/${f.enrollmentId}`),
        200,
      );
      expect(enrollment).not.toHaveProperty('finance');
      for (const path of [
        'payments',
        'leads',
        'business-accounts',
        'attendance/self-token',
        'attendance-policies',
        `enrollments/${f.enrollmentId}/finance-summary`,
      ])
        await responseBody(await get(context, path), 403);
      for (const path of [
        'students',
        'enrollments',
        'programs',
        'cohorts',
        'sessions',
        'payments',
        'certificates/issue',
        'certificates/evaluate',
      ])
        await responseBody(await post(context, path, {}, headers()), 403);
      await responseBody(
        await patch(context, `students/${f.studentPersonId}`, { name: 'Forbidden' }, headers()),
        403,
      );
      await responseBody(
        await post(context, `sessions/${f.sessionId}/complete`, {}, headers()),
        403,
      );
    });
  });
  it('removes access after cancellation of the teaching assignment or inactive trainer profile', async () => {
    await runHttpScenario({ permissions: [], roleCode: 'TRAINER' }, async (context) => {
      const f = await trainerFixture(context);
      await context.prisma.sessionTrainer.update({
        where: { id: f.assignmentId },
        data: { bookingStatus: 'CANCELLED' },
      });
      for (const path of [
        'sessions',
        'cohorts',
        'students',
        'enrollments',
        'rooms',
        'certificates',
      ])
        expect(ids(await responseBody(await get(context, path), 200))).toEqual([]);
      await responseBody(await get(context, `sessions/${f.sessionId}/attendance`), 404);
      await context.prisma.sessionTrainer.update({
        where: { id: f.assignmentId },
        data: { bookingStatus: 'CONFIRMED' },
      });
      await context.prisma.trainerProfile.update({
        where: { id: f.trainerId },
        data: { status: 'INACTIVE' },
      });
      for (const path of ['sessions', 'cohorts', 'students', 'enrollments', 'rooms', 'trainers'])
        expect(ids(await responseBody(await get(context, path), 200))).toEqual([]);
    });
  });
  it('reports personal metrics and next session without incorporating peer sessions', async () => {
    await runHttpScenario({ permissions: [], roleCode: 'TRAINER' }, async (context) => {
      const f = await trainerFixture(context);
      await context.prisma.session.update({
        where: { id: f.sessionId },
        data: { startsAt: new Date(Date.now() + 1800000), endsAt: new Date(Date.now() + 5400000) },
      });
      const result = z
        .object({
          metrics: z.array(z.object({ key: z.string(), value: z.number() })),
          staff: z.object({
            kind: z.string(),
            nextSession: z.object({ id: z.string() }),
            days: z.array(z.object({ minutes: z.number() })),
          }),
          queue: z.object({ total: z.number(), items: z.array(z.object({ id: z.string() })) }),
        })
        .parse(await responseBody(await get(context, 'dashboard/workspaces/TRAINER'), 200));
      expect(result.staff.kind).toBe('TRAINER');
      expect(result.staff.nextSession.id).toBe(f.sessionId);
      expect(result.staff.days.reduce((sum, day) => sum + day.minutes, 0)).toBe(60);
      expect(result.queue.total).toBe(1);
      expect(result.queue.items.map(({ id }) => id)).toEqual([f.sessionId]);
      expect(result.metrics.find(({ key }) => key === 'sessionsNext7Days')?.value).toBe(1);
      await responseBody(await get(context, 'dashboard/overview'), 403);
      await responseBody(
        await get(context, `dashboard/overview?branchId=${context.branchId}`),
        403,
      );
    });
  });
});
