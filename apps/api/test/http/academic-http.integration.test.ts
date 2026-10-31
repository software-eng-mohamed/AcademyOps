import { academic, body, type CommandResult } from './academic-role-http-support';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { runHttpScenario } from './http-test-harness';
import { get, patch, post, put } from './finance-http-client';
import { seedApprovedFinance, seedBusinessFixture } from './business-chain-fixture';
import { runAcademicCatalogHttpStep } from './domain-academic-catalog-http.step';
import { runAcademicSessionsHttpStep } from './domain-academic-sessions-http.step';
import { runAttendanceStep } from './attendance-http.step';
import { runAttendanceRemainingStep } from './attendance-remaining-http.step';
import { runCertificateStep } from './certificate-http.step';

const databaseDescribe =
  process.env.DATABASE_URL && process.env.REDIS_URL ? describe : describe.skip;
databaseDescribe('Academic with the shipped O/B grants over authenticated HTTP', () => {
  it('manages curriculum, resources, cohorts and sessions while excluding finance and administration', async () => {
    await runHttpScenario({ permissions: [], roleCode: 'ACADEMIC' }, async (context) => {
      await academic(context);
      const catalog = await runAcademicCatalogHttpStep(context);
      await runAcademicSessionsHttpStep(context, catalog);
      for (const path of [
        'payments',
        'invoices',
        'users',
        'audit-events',
        'certificate-rules',
        'business-accounts',
        'pricing-agreements',
        'reports/finance/receivables',
      ]) {
        await body(await get(context, path), 403);
      }
      const overview = await body(await get(context, 'dashboard/workspaces/ACADEMIC'), 200);
      expect(overview.role).toBe('ACADEMIC');
      // Overview APIs authorize their underlying data requirements, not a role label.
      await body(await get(context, 'dashboard/workspaces/ACCOUNTS'), 403);
    });
  }, 120_000);

  it('reads students, manages enrollment learning states, attendance and certificate fulfillment without acquiring commercial authority', async () => {
    await runHttpScenario({ permissions: [], roleCode: 'ACADEMIC' }, async (context) => {
      await academic(context);
      const fixture = await seedBusinessFixture(context);
      const billing = await context.prisma.billingAccount.create({
        data: {
          organizationId: context.organizationId,
          kind: 'INDIVIDUAL',
          personId: fixture.studentPersonId,
        },
      });
      const enrollment = await context.prisma.enrollment.create({
        data: {
          organizationId: context.organizationId,
          studentPersonId: fixture.studentPersonId,
          programVersionId: fixture.programVersionId,
          billingAccountId: billing.id,
          homeBranchId: context.branchId,
          state: 'ACTIVE',
          activatedAt: new Date(Date.now() - 86_400_000),
        },
      });
      await context.prisma.enrollmentCohortAssignment.create({
        data: {
          organizationId: context.organizationId,
          enrollmentId: enrollment.id,
          cohortId: fixture.cohortId,
          startsAt: new Date(Date.now() - 86_400_000),
          createdBy: context.userId,
        },
      });
      await seedApprovedFinance(context, enrollment.id);
      // Commercial setup is fixture data; Academic must never activate or bill the enrollment.
      await context.prisma.ledgerEntry.create({
        data: {
          organizationId: context.organizationId,
          billingAccountId: billing.id,
          enrollmentId: enrollment.id,
          direction: 'DEBIT',
          entryType: 'INSTALLMENT_DUE',
          amount: '200.00',
          sourceType: 'HTTP_TEST_TUITION',
          sourceId: randomUUID(),
        },
      });
      const student = await body(await get(context, `students/${fixture.studentPersonId}`), 200);
      expect(student.id).toBe(fixture.studentPersonId);
      expect(student.name).toBe('HTTP business student');
      const listed = await body<{ items: Array<{ id: string }> }>(
        await get(context, 'students?search=HTTP%20business%20student'),
        200,
      );
      expect(listed.items.map((item: { id: string }) => item.id)).toContain(
        fixture.studentPersonId,
      );
      await body(await get(context, `students/${fixture.foreignStudentPersonId}`), 404);
      await body(
        await post(context, 'students', {
          name: 'Unauthorized student',
          branchId: context.branchId,
        }),
        403,
      );
      await body(
        await patch(
          context,
          `students/${fixture.studentPersonId}`,
          { name: 'Unauthorized edit' },
          { 'if-match': '1' },
        ),
        403,
      );
      await body(
        await put(
          context,
          `students/${fixture.studentPersonId}/contacts`,
          { contacts: [] },
          { 'if-match': '1' },
        ),
        403,
      );
      await body(
        await post(context, 'enrollments', {
          studentPersonId: fixture.studentPersonId,
          cohortId: fixture.cohortId,
          homeBranchId: context.branchId,
          kind: 'INDIVIDUAL',
        }),
        403,
      );
      for (const command of ['submit', 'activate', 'reject']) {
        await body(
          await post(
            context,
            `enrollments/${enrollment.id}/${command}`,
            { reason: 'Unauthorized commercial decision' },
            { 'if-match': '1' },
          ),
          403,
        );
      }
      const detail = await body(await get(context, `enrollments/${enrollment.id}`), 200);
      expect(detail.finance).toBeUndefined();
      await runAttendanceStep(context, fixture, enrollment.id);
      await runCertificateStep(context, fixture, enrollment.id, false);
      const certificate = await context.prisma.certificate.findFirstOrThrow({
        where: { enrollmentId: enrollment.id },
      });
      const pdfBytes = '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n';
      const form = new FormData();
      form.append(
        'file',
        new Blob([pdfBytes], {
          type: 'application/pdf',
        }),
        'academic-test.pdf',
      );
      await body(
        await fetch(`${context.baseUrl}/api/v1/certificates/${certificate.id}/file`, {
          method: 'POST',
          headers: { ...context.unsafeHeaders, 'if-match': '1', 'idempotency-key': randomUUID() },
          body: form,
        }),
        201,
      );
      let certificateVersion = 2;
      for (const action of ['print', 'ready', 'collect']) {
        const result = await body<CommandResult>(
          await post(context, `certificates/${certificate.id}/${action}`, undefined, {
            'if-match': String(certificateVersion),
            'idempotency-key': randomUUID(),
          }),
          201,
        );
        certificateVersion = result.version;
      }
      const download = await body<{ url: string; expiresAt: string }>(
        await get(context, `certificates/${certificate.id}/download`),
        200,
      );
      const signedUrl = new URL(download.url);
      expect(signedUrl.pathname).toMatch(/^\/api\/v1\/files\/[^/]+\/content$/);
      expect(new Date(download.expiresAt).getTime()).toBeGreaterThan(Date.now());
      // The harness serves HTTP on a random port; keep the generated signed path intact.
      const fileResponse = await fetch(
        `${context.baseUrl}${signedUrl.pathname}${signedUrl.search}`,
      );
      expect(fileResponse.status).toBe(200);
      expect(fileResponse.headers.get('content-type')).toContain('application/pdf');
      expect(fileResponse.headers.get('content-disposition')).toContain('attachment;');
      expect(await fileResponse.text()).toBe(pdfBytes);
      signedUrl.searchParams.set('signature', 'invalid');
      await body(await fetch(`${context.baseUrl}${signedUrl.pathname}${signedUrl.search}`), 404);
      await runAttendanceRemainingStep(context, fixture, enrollment.id);
      const target = await context.prisma.cohort.create({
        data: {
          organizationId: context.organizationId,
          programVersionId: fixture.programVersionId,
          owningBranchId: context.branchId,
          code: `ACADEMIC-${randomUUID().slice(0, 8)}`,
          capacity: 10,
        },
      });
      await context.prisma.cohort.update({ where: { id: target.id }, data: { status: 'PLANNED' } });
      let version = 1;
      const transferred = await body<CommandResult>(
        await post(
          context,
          `enrollments/${enrollment.id}/transfer`,
          { targetCohortId: target.id, reason: 'Academic learning transfer' },
          { 'if-match': String(version) },
        ),
        201,
      );
      version = transferred.version;
      for (const [command, state] of [
        ['postpone', 'POSTPONED'],
        ['resume', 'ACTIVE'],
      ] as const) {
        const result = await body<CommandResult>(
          await post(
            context,
            `enrollments/${enrollment.id}/${command}`,
            { reason: `Academic ${command} evidence` },
            { 'if-match': String(version) },
          ),
          201,
        );
        expect(result.state).toBe(state);
        version = result.version;
      }
      const cancellation = await body<CommandResult>(
        await post(
          context,
          `enrollments/${enrollment.id}/cancellation-requests`,
          { reason: 'Academic cancellation request for review' },
          { 'if-match': String(version), 'idempotency-key': randomUUID() },
        ),
        201,
      );
      expect(cancellation.status).toBe('REQUESTED');
      for (const decision of ['approve', 'reject']) {
        await body(
          await post(
            context,
            `enrollment-cancellation-requests/${cancellation.id}/${decision}`,
            { reason: 'Not an academic decision' },
            { 'idempotency-key': randomUUID() },
          ),
          403,
        );
      }
      const module = await context.prisma.programVersionModule.findFirstOrThrow({
        where: { programVersionId: fixture.programVersionId },
      });
      for (const decision of ['approve', 'reject']) {
        const retake = await body<CommandResult>(
          await post(context, `enrollments/${enrollment.id}/retakes`, {
            programVersionModuleId: module.id,
            reason: `Academic retake ${decision} evidence`,
          }),
          201,
        );
        const result = await body<CommandResult>(
          await post(
            context,
            `module-retakes/${retake.id}/${decision}`,
            { reason: `Academic ${decision} review` },
            { 'if-match': String(retake.version) },
          ),
          201,
        );
        expect(result.status).toBe(decision === 'approve' ? 'APPROVED' : 'REJECTED');
      }
      const completed = await body(
        await post(
          context,
          `enrollments/${enrollment.id}/complete`,
          { reason: 'Academic completion verified' },
          { 'if-match': String(version) },
        ),
        201,
      );
      expect(completed.state).toBe('COMPLETED');
    });
  }, 120_000);
});
