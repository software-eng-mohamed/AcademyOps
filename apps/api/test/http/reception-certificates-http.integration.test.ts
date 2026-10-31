import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { runHttpScenario } from './http-test-harness';
import { get, post } from './finance-http-client';
import { seedBusinessFixture } from './business-chain-fixture';
import { reception, body, headers } from './reception-role-http-support';
import { FileStorageService } from '../../src/platform/files/file-storage.service';
const databaseDescribe =
  process.env.DATABASE_URL && process.env.REDIS_URL ? describe : describe.skip;

databaseDescribe('Reception with the shipped branch grants over authenticated HTTP', () => {
  it('fulfills an issued certificate while excluding issue, upload, revoke and attendance edits', async () => {
    await runHttpScenario({ permissions: [], roleCode: 'RECEPTION' }, async (context) => {
      await reception(context);
      const fixture = await seedBusinessFixture(context);
      const organizationId = context.organizationId;
      const enrollmentId = fixture.secondEnrollmentId;
      // Academic/finance prerequisites are fixture data, never extra Reception grants.
      const session = await context.prisma.session.create({
        data: {
          organizationId,
          cohortId: fixture.cohortId,
          cohortModuleId: fixture.cohortModuleId,
          ordinal: 1,
          status: 'COMPLETED',
          startsAt: new Date(Date.now() - 3_600_000),
          endsAt: new Date(Date.now() - 1_800_000),
          deliveryMode: 'ONLINE',
        },
      });
      await context.prisma.attendanceRecord.create({
        data: {
          organizationId,
          sessionId: session.id,
          enrollmentId,
          currentStatus: 'PRESENT',
          source: 'MANUAL',
          recordedAt: new Date(),
          recordedBy: context.userId,
        },
      });
      const rule = await context.prisma.certificateRuleVersion.create({
        data: {
          organizationId,
          programVersionId: fixture.programVersionId,
          cohortId: fixture.cohortId,
          version: 1,
          minimumRatio: '0.8000',
          effectiveFrom: new Date(Date.now() - 86_400_000),
          createdBy: context.userId,
        },
      });
      const evaluation = await context.prisma.eligibilityEvaluation.create({
        data: {
          organizationId,
          enrollmentId,
          ruleVersionId: rule.id,
          academicResult: 'ELIGIBLE',
          financialHold: false,
          attendanceRatio: '1.0000',
          evidenceSnapshot: {},
          evaluatedBy: context.userId,
        },
      });
      const bytes = Buffer.from('%PDF-1.4\n%%EOF\n');
      const storageKey = `${organizationId}/reception-${randomUUID()}.pdf`;
      const files = context.app.get(FileStorageService);
      await files.putPrivate(storageKey, bytes, 'application/pdf');
      const asset = await context.prisma.fileAsset.create({
        data: {
          organizationId,
          storageKey,
          contentType: 'application/pdf',
          sizeBytes: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          scanStatus: 'CLEAN',
          createdBy: context.userId,
        },
      });
      const certificate = await context.prisma.certificate.create({
        data: {
          organizationId,
          enrollmentId,
          evaluationId: evaluation.id,
          serial: `RECEPTION-${randomUUID()}`,
          verificationDigest: randomUUID(),
          issuedBy: context.userId,
          pdfStatus: 'AVAILABLE',
          fileAssetId: asset.id,
        },
      });
      await body(await get(context, `certificates/${certificate.id}`), 200);
      await body(await get(context, `certificates?enrollmentId=${enrollmentId}`), 200);
      await body(await get(context, `certificates/enrollments/${enrollmentId}/eligibility`), 200);
      let version = 1;
      for (const [action, status] of [
        ['print', 'PRINTED'],
        ['ready', 'READY_FOR_COLLECTION'],
        ['collect', 'COLLECTED'],
      ] as const) {
        const key = headers(version);
        const result = await body(
          await post(context, `certificates/${certificate.id}/${action}`, undefined, key),
          201,
        );
        expect(result.fulfillmentStatus).toBe(status);
        expect(
          await body(
            await post(context, `certificates/${certificate.id}/${action}`, undefined, key),
            201,
          ),
        ).toEqual(result);
        version = result.version;
      }
      for (const action of ['issue', 'evaluate'])
        await body(await post(context, `certificates/${action}`, { enrollmentId }, headers()), 403);
      await body(
        await post(
          context,
          `certificates/${certificate.id}/revoke`,
          { reason: 'Reception may not revoke' },
          headers(version),
        ),
        403,
      );
      await body(
        await post(context, `certificates/${certificate.id}/file`, undefined, headers(version)),
        403,
      );
      await body(await get(context, `sessions/${session.id}/attendance`), 403);
      await body(await post(context, `sessions/${session.id}/attendance-window/open`), 403);
      await body(
        await post(context, `sessions/${session.id}/attendance/manual`, {
          enrollmentId,
          status: 'ABSENT',
        }),
        403,
      );
      const events = await context.prisma.certificateEvent.count({
        where: { certificateId: certificate.id },
      });
      expect(events).toBe(3);
      const download = await body<{ url: string }>(
        await get(context, `certificates/${certificate.id}/download`),
        200,
      );
      const signed = new URL(download.url);
      const response = await fetch(`${context.baseUrl}${signed.pathname}${signed.search}`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/pdf');
      expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
      await files.deletePrivate(storageKey);
    });
  }, 120_000);
});
