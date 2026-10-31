import { randomUUID } from 'node:crypto';
import { defaultRoleGrants } from '@academyops/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { runHttpScenario, type HttpTestContext } from './http-test-harness';
import { get, patch, post, put } from './finance-http-client';
import { seedApprovedFinance, seedBusinessFixture } from './business-chain-fixture';
import { runAcademicCatalogHttpStep } from './domain-academic-catalog-http.step';
import { runAcademicSessionsHttpStep } from './domain-academic-sessions-http.step';
import { runEnrollmentStep } from './enrollment-http.step';
import { runEnrollmentRemainingStep } from './enrollment-remaining-http.step';
import { runAttendanceStep } from './attendance-http.step';
import { runAttendanceRemainingStep } from './attendance-remaining-http.step';
import { runCertificateStep } from './certificate-http.step';

const databaseDescribe =
  process.env.DATABASE_URL && process.env.REDIS_URL ? describe : describe.skip;
const identifiedRecord = z.object({ id: z.string().uuid() });
const recordList = z.object({ items: z.array(identifiedRecord) });
const candidateList = z.array(z.object({ personId: z.string().uuid() }));
const pricingPage = recordList.extend({ nextCursor: z.string().nullable() });
const versionedRecord = z.object({ version: z.number().int().positive() });
async function operations(context: HttpTestContext) {
  const role = await context.prisma.userRoleAssignment.findFirstOrThrow({
    where: { userId: context.userId },
  });
  await context.prisma.rolePermissionGrant.createMany({
    data: defaultRoleGrants.OPERATIONS.map(([permissionCode, scope]) => ({
      organizationId: context.organizationId,
      roleId: role.roleId,
      permissionCode,
      scope,
    })),
  });
  const staff = await context.prisma.staffProfile.create({
    data: { organizationId: context.organizationId, personId: context.personId },
  });
  await context.prisma.staffBranchAssignment.create({
    data: {
      organizationId: context.organizationId,
      staffProfileId: staff.id,
      branchId: context.branchId,
    },
  });
}
async function body(response: Response, status: number) {
  const value: unknown = await response.json();
  expect(response.status, JSON.stringify(value)).toBe(status);
  return value;
}
databaseDescribe('Operations with the shipped O/B grants over authenticated HTTP', () => {
  it('manages catalog, curriculum, resources, cohorts and full session lifecycle', async () => {
    await runHttpScenario({ permissions: [], roleCode: 'OPERATIONS' }, async (context) => {
      await operations(context);
      const academic = await runAcademicCatalogHttpStep(context);
      await runAcademicSessionsHttpStep(context, academic);
      for (const path of [
        'payments',
        'invoices',
        'users',
        'audit-events',
        'certificate-rules',
        'reports/finance/receivables',
      ])
        expect((await get(context, path)).status, path).toBe(403);
      await body(await get(context, 'dashboard/workspaces/OPERATIONS'), 200);
    });
  }, 120_000);
  it('creates a discoverable student, edits permitted fields, enrolls, records/corrects attendance and fulfills a certificate', async () => {
    await runHttpScenario({ permissions: [], roleCode: 'OPERATIONS' }, async (context) => {
      await operations(context);
      const fixture = await seedBusinessFixture(context);
      const suffix = randomUUID().slice(0, 8);
      const student = identifiedRecord.parse(
        await body(
          await post(context, 'students', {
            name: `Operations ${suffix}`,
            email: `${suffix}@example.test`,
            birthDate: '2000-01-01',
            gender: 'MALE',
            branchId: context.branchId,
          }),
          201,
        ),
      );
      fixture.studentPersonId = student.id;
      for (const query of [`search=${suffix}`, `branchId=${context.branchId}&search=${suffix}`]) {
        const list = recordList.parse(await body(await get(context, `students?${query}`), 200));
        expect(list.items.map((item) => item.id)).toContain(student.id);
      }
      await body(await get(context, `students/${student.id}`), 200);
      const matches = candidateList.parse(
        await body(
          await post(context, 'students/match-candidates', { email: `${suffix}@example.test` }),
          201,
        ),
      );
      expect(matches.map((item) => item.personId)).toContain(student.id);
      await body(
        await patch(
          context,
          `students/${student.id}`,
          { name: `Updated Operations ${suffix}` },
          { 'if-match': '1' },
        ),
        200,
      );
      await body(
        await patch(context, `students/${student.id}`, { gender: 'FEMALE' }, { 'if-match': '2' }),
        403,
      );
      await body(
        await put(
          context,
          `students/${student.id}/contacts`,
          { contacts: [{ type: 'EMAIL', value: `${suffix}@example.test`, isPrimary: true }] },
          { 'if-match': '2' },
        ),
        200,
      );
      expect((await get(context, `students/${fixture.foreignStudentPersonId}`)).status).toBe(404);
      // A same-company student with no enrollment or creation event in the granted scope stays hidden.
      const hidden = await context.prisma.person.create({
        data: {
          organizationId: context.organizationId,
          publicId: `H-${suffix}`,
          name: 'Unassigned student',
        },
      });
      await context.prisma.studentProfile.create({
        data: { organizationId: context.organizationId, personId: hidden.id },
      });
      expect((await get(context, `students/${hidden.id}`)).status).toBe(404);
      const enrollment = await runEnrollmentStep(context, fixture);
      // A scoped reader may see both enrollments, but a detail filter must never be
      // replaced by the broader scope filter (including when paginating).
      await seedApprovedFinance(context, fixture.secondEnrollmentId);
      const expectedAgreement = await context.prisma.pricingAgreement.findFirstOrThrow({
        where: { enrollmentId: enrollment },
      });
      const fees = pricingPage.parse(
        await body(
          await get(context, `pricing-agreements?enrollmentId=${enrollment}&limit=1`),
          200,
        ),
      );
      expect(fees.items.map((item) => item.id)).toEqual([expectedAgreement.id]);
      expect(fees.nextCursor).toBeNull();
      await runAttendanceStep(context, fixture, enrollment);
      await runCertificateStep(context, fixture, enrollment, false);
      const certificate = await context.prisma.certificate.findFirstOrThrow({
        where: { enrollmentId: enrollment, validityStatus: 'ISSUED' },
      });
      const form = new FormData();
      form.append(
        'file',
        new Blob(['%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n'], {
          type: 'application/pdf',
        }),
        'operations-test.pdf',
      );
      await body(
        await fetch(`${context.baseUrl}/api/v1/certificates/${certificate.id}/file`, {
          method: 'POST',
          headers: { ...context.unsafeHeaders, 'if-match': '1', 'idempotency-key': randomUUID() },
          body: form,
        }),
        201,
      );
      let version = 2;
      for (const action of ['print', 'ready', 'collect']) {
        const result = versionedRecord.parse(
          await body(
            await post(context, `certificates/${certificate.id}/${action}`, undefined, {
              'if-match': String(version),
              'idempotency-key': randomUUID(),
            }),
            201,
          ),
        );
        version = result.version;
      }
      await runAttendanceRemainingStep(context, fixture, enrollment);
      await runEnrollmentRemainingStep(context, fixture, enrollment);
    });
  }, 120_000);
});
