import { ids, fixture, challenge } from './student-role-http-support';
import { createHash, randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { databaseDescribe, headers, responseBody } from './attendance-role-http-support';
import { seedBusinessFixture } from './business-chain-fixture';
import { get, post } from './finance-http-client';
import { runHttpScenario } from './http-test-harness';
import { setupStudentAPricingAndLedger } from '../postgres/student-fixture-helper';
import { trainerCertificate } from './trainer-role-http-support';
import { FileStorageService } from '../../src/platform/files/file-storage.service';

databaseDescribe('Student workspace using actual self-only grants', () => {
  it('returns only own enrollment and roster rows before pagination; hides peers and draft sessions', async () => {
    await runHttpScenario({ permissions: [], roleCode: 'STUDENT' }, async (context) => {
      const f = await fixture(context);
      expect(ids(await responseBody(await get(context, 'enrollments'), 200))).toEqual([
        f.enrollmentId,
      ]);
      expect(ids(await responseBody(await get(context, 'sessions'), 200))).toEqual([f.sessionId]);
      const roster = await responseBody(
        await get(context, `sessions/${f.sessionId}/attendance?limit=1`),
        200,
      );
      expect(roster).toMatchObject({
        items: [{ enrollmentId: f.enrollmentId, student: { id: f.studentPersonId } }],
        nextCursor: null,
      });
      const parsed = z
        .object({ items: z.array(z.object({ enrollmentId: z.string() })) })
        .parse(roster);
      expect(parsed.items).toHaveLength(1);
      const peerRecord = await context.prisma.attendanceRecord.create({
        data: {
          organizationId: context.organizationId,
          sessionId: f.sessionId,
          enrollmentId: f.secondEnrollmentId,
          currentStatus: 'PRESENT',
          source: 'MANUAL',
          recordedBy: context.userId,
          recordedAt: new Date(),
        },
      });
      await responseBody(await get(context, `attendance/${peerRecord.id}`), 404);
      expect(
        await responseBody(
          await get(context, `sessions/${f.sessionId}/attendance?cursor=${f.enrollmentId}`),
          200,
        ),
      ).toMatchObject({ items: [], nextCursor: null });
      expect(JSON.stringify(roster)).not.toContain(f.foreignStudentPersonId);
      for (const path of [
        `enrollments/${f.secondEnrollmentId}`,
        `students/${f.foreignStudentPersonId}`,
        `enrollments/${f.secondEnrollmentId}/attendance-summary`,
      ])
        await responseBody(await get(context, path), 404);
      await context.prisma.session.update({
        where: { id: f.sessionId },
        data: { status: 'DRAFT' },
      });
      expect(ids(await responseBody(await get(context, 'sessions'), 200))).toEqual([]);
      await responseBody(await get(context, `sessions/${f.sessionId}/attendance`), 404);
      await responseBody(await get(context, `sessions/${f.sessionId}`), 404);
    });
  });
  it('records a valid self check-in once, handles replay, invalid/expired tokens and closed windows', async () => {
    await runHttpScenario({ permissions: [], roleCode: 'STUDENT' }, async (context) => {
      const f = await fixture(context);
      await context.prisma.session.update({
        where: { id: f.sessionId },
        data: { attendanceWindowState: 'OPEN' },
      });
      const token = await challenge(context, f.sessionId);
      const key = headers();
      const result = await responseBody(
        await post(context, 'attendance/check-in', { token }, key),
        201,
      );
      expect(result).toMatchObject({ status: 'PRESENT', version: 1 });
      expect(
        await responseBody(await post(context, 'attendance/check-in', { token }, key), 201),
      ).toEqual(result);
      expect(
        await context.prisma.attendanceRecord.count({ where: { enrollmentId: f.enrollmentId } }),
      ).toBe(1);
      const ownQr = await responseBody(await get(context, 'attendance/self-token'), 200);
      expect(await responseBody(await get(context, 'attendance/self-token'), 200)).toEqual(ownQr);
      for (const badToken of [
        `${randomUUID()}.${randomUUID()}`,
        await challenge(context, f.sessionId, true),
      ]) {
        expect(
          await responseBody(
            await post(context, 'attendance/check-in', { token: badToken }, headers()),
            401,
          ),
        ).toMatchObject({ code: 'QR_INVALID_OR_EXPIRED' });
        await responseBody(await get(context, 'auth/me'), 200);
      }
      await context.prisma.session.update({
        where: { id: f.sessionId },
        data: { attendanceWindowState: 'LOCKED' },
      });
      await responseBody(
        await post(
          context,
          'attendance/check-in',
          { token: await challenge(context, f.sessionId) },
          headers(),
        ),
        409,
      );
      const record = z.object({ id: z.string() }).parse(result);
      await responseBody(await get(context, `attendance/${record.id}`), 200);
      for (const path of [
        `sessions/${f.sessionId}/attendance/manual`,
        `sessions/${f.sessionId}/attendance-window/open`,
        `sessions/${f.sessionId}/qr-challenges`,
        `attendance/${record.id}/corrections`,
      ])
        await responseBody(await post(context, path, {}, headers()), 403);
    });
  });
  it('reads own installment balances, documents and certificate eligibility but never peers or staff commands', async () => {
    await runHttpScenario({ permissions: [], roleCode: 'STUDENT' }, async (context) => {
      const f = await fixture(context);
      const enrollment = await context.prisma.enrollment.findUniqueOrThrow({
        where: { id: f.enrollmentId },
      });
      const ledger = await setupStudentAPricingAndLedger(
        context.prisma,
        context.organizationId,
        f.enrollmentId,
        context.userId,
        enrollment.billingAccountId,
      );
      expect(
        await responseBody(
          await get(context, `enrollments/${f.enrollmentId}/finance-summary`),
          200,
        ),
      ).toMatchObject({ balance: '160.00', totalDebits: '200.00', totalCredits: '40.00' });
      expect(
        await responseBody(
          await get(context, `enrollments/${f.enrollmentId}/installments?limit=1`),
          200,
        ),
      ).toMatchObject({
        items: [{ originalAmount: '100.00', outstandingAmount: '60.00', payable: true }],
      });
      const credit = await context.prisma.ledgerEntry.create({
        data: {
          organizationId: context.organizationId,
          enrollmentId: f.enrollmentId,
          billingAccountId: enrollment.billingAccountId,
          direction: 'CREDIT',
          entryType: 'PAYMENT',
          amount: '160.00',
          sourceType: 'PAYMENT',
          sourceId: randomUUID(),
        },
      });
      await context.prisma.ledgerAllocation.createMany({
        data: [
          { debitEntryId: ledger.debit1.id, amount: '60.00' },
          { debitEntryId: ledger.debit2.id, amount: '100.00' },
        ].map((entry) => ({
          ...entry,
          creditEntryId: credit.id,
          organizationId: context.organizationId,
          createdBy: context.userId,
        })),
      });
      const own = await trainerCertificate(
        context,
        f.enrollmentId,
        f.programVersionId,
        f.sessionId,
      );
      const other = await seedBusinessFixture(context);
      for (const path of [
        'payments',
        'invoices',
        'receipts',
        `program-versions/${f.programVersionId}`,
        `certificates/enrollments/${f.enrollmentId}/eligibility`,
      ])
        await responseBody(await get(context, path), 200);
      expect(ids(await responseBody(await get(context, 'certificates'), 200))).toEqual([own.id]);
      await responseBody(await get(context, `certificates/${own.id}`), 200);
      expect(
        await responseBody(await get(context, `certificates/${own.id}/download`), 409),
      ).toMatchObject({ code: 'CERTIFICATE_PDF_NOT_AVAILABLE' });
      const storage = context.app.get(FileStorageService);
      const storageKey = `student-qa/${own.id}.pdf`;
      const bytes = Buffer.from('%PDF-1.4\n% Synthetic student download test\n%%EOF');
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
          .object({ url: z.string() })
          .parse(await responseBody(await get(context, `certificates/${own.id}/download`), 200));
        const url = new URL(download.url);
        const pdf = await fetch(`${context.baseUrl}${url.pathname}${url.search}`);
        expect(pdf.status).toBe(200);
        expect(pdf.headers.get('content-type')).toContain('application/pdf');
        expect(Buffer.from(await pdf.arrayBuffer())).toEqual(bytes);
      } finally {
        await storage.deletePrivate(storageKey);
      }
      for (const path of [
        `enrollments/${f.secondEnrollmentId}/finance-summary`,
        `enrollments/${f.secondEnrollmentId}/installments`,
        `enrollments/${other.secondEnrollmentId}`,
        `certificates?enrollmentId=${f.secondEnrollmentId}`,
      ])
        await responseBody(await get(context, path), 404);
      for (const path of [
        'payments',
        'enrollments',
        'sessions',
        'certificates/issue',
        'certificates/evaluate',
      ])
        await responseBody(await post(context, path, {}, headers()), 403);
      await responseBody(await get(context, 'dashboard/workspaces/STUDENT'), 200);
      await responseBody(await get(context, 'dashboard/overview'), 403);
    });
  });
});
