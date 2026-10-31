import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { createTestHarness } from './harness';
import { setupStudentSelfServiceFixture } from './student-self-service-fixture';
import {
  setupCertServices,
  createTestEnrollment,
  setAttendance,
  setupFinance,
} from './certificate-test-helper';

const harness = createTestHarness();

harness.databaseDescribe('Student Certificate Eligibility and Issue Regression', () => {
  afterAll(async () => {
    await harness.prisma.$disconnect();
  });

  it(
    'proves eligibility and issuance gates behavior for ACTIVE and COMPLETED enrollments',
    () =>
      harness.inRollbackTransaction(async (transaction) => {
        const fx = await setupStudentSelfServiceFixture(transaction);
        const { certRead, certsService } = setupCertServices(fx);

        const adminAccess: AccessContext = {
          organizationId: fx.orgA.id,
          actorUserId: fx.studentAUser.id,
          grants: new Map([
            ['certificates.read', new Set(['O'])],
            ['certificates.issue', new Set(['O'])],
          ]),
          branchIds: new Set([fx.branchA.id]),
          assignedResourceIds: new Set(),
        };

        await transaction.certificateRuleVersion.create({
          data: {
            organizationId: fx.orgA.id,
            programVersionId: fx.versionA.id,
            cohortId: null,
            version: 1,
            minimumRatio: new Prisma.Decimal('0.80'),
            effectiveFrom: new Date('2026-01-01'),
            createdBy: fx.studentAUser.id,
          },
        });

        const cohortModule = await transaction.cohortModule.create({
          data: {
            organizationId: fx.orgA.id,
            cohortId: fx.cohortA.id,
            programVersionModuleId: fx.pvmA.id,
            ordinal: 1,
          },
        });

        const sessions = Array.from({ length: 100 }, (_, index) => ({
          id: randomUUID(),
          ordinal: index + 1,
        }));
        await transaction.session.createMany({
          data: sessions.map(({ id, ordinal }) => ({
            id,
            organizationId: fx.orgA.id,
            cohortId: fx.cohortA.id,
            cohortModuleId: cohortModule.id,
            ordinal,
            startsAt: new Date('2026-08-11T00:00:00Z'),
            status: 'SCHEDULED',
            deliveryMode: 'IN_PERSON',
          })),
        });

        // CASE 1: ACTIVE enrollment + exactly 80% attendance + zero outstanding => overall eligible and issuable
        const c1 = await createTestEnrollment(transaction, fx, 'ACTIVE');
        await setAttendance(transaction, fx, sessions, c1.enrollment.id, c1.user.id, 80);
        await setupFinance(transaction, fx, c1.enrollment.id, c1.user.id, c1.billing.id, true);

        const res1 = await certRead.checkEligibility(c1.access, c1.enrollment.id);
        expect(res1.attendanceRatio).toBe('0.8000');
        expect(res1.academicEligibility).toBe('ELIGIBLE');
        expect(res1.financialHold).toBe(false);
        expect(res1.overallEligibility).toBe(true);

        const cert1 = await certsService.issue(
          adminAccess,
          c1.enrollment.id,
          randomUUID(),
          randomUUID(),
        );
        expect(cert1.validityStatus).toBe('ISSUED');

        // CASE 2: below 80% (79/100) => ineligible
        const c2 = await createTestEnrollment(transaction, fx, 'ACTIVE');
        await setAttendance(transaction, fx, sessions, c2.enrollment.id, c2.user.id, 79);
        await setupFinance(transaction, fx, c2.enrollment.id, c2.user.id, c2.billing.id, true);

        const res2 = await certRead.checkEligibility(c2.access, c2.enrollment.id);
        expect(res2.attendanceRatio).toBe('0.7900');
        expect(res2.academicEligibility).toBe('INELIGIBLE');
        expect(res2.overallEligibility).toBe(false);

        const issueErr2 = (await certsService
          .issue(adminAccess, c2.enrollment.id, randomUUID(), randomUUID())
          .catch((error: unknown) => error)) as { response?: Record<string, unknown> };
        expect(issueErr2.response).toMatchObject({
          code: 'CERTIFICATE_ACADEMIC_INELIGIBLE',
        });

        // CASE 3: attendance >=80% with a positive outstanding debit => ineligible/financial hold
        const c3 = await createTestEnrollment(transaction, fx, 'ACTIVE');
        await setAttendance(transaction, fx, sessions, c3.enrollment.id, c3.user.id, 80);
        await setupFinance(transaction, fx, c3.enrollment.id, c3.user.id, c3.billing.id, false);

        const res3 = await certRead.checkEligibility(c3.access, c3.enrollment.id);
        expect(res3.attendanceRatio).toBe('0.8000');
        expect(res3.academicEligibility).toBe('ELIGIBLE');
        expect(res3.financialHold).toBe(true);
        expect(res3.overallEligibility).toBe(false);

        const issueErr3 = (await certsService
          .issue(adminAccess, c3.enrollment.id, randomUUID(), randomUUID())
          .catch((error: unknown) => error)) as { response?: Record<string, unknown> };
        expect(issueErr3.response).toMatchObject({
          code: 'CERTIFICATE_FINANCIAL_HOLD',
        });

        // CASE 4a: COMPLETED enrollment + exactly 80% attendance + zero outstanding => overall eligible and issuable
        const c4a = await createTestEnrollment(transaction, fx, 'COMPLETED');
        await setAttendance(transaction, fx, sessions, c4a.enrollment.id, c4a.user.id, 80);
        await setupFinance(transaction, fx, c4a.enrollment.id, c4a.user.id, c4a.billing.id, true);

        const res4a = await certRead.checkEligibility(c4a.access, c4a.enrollment.id);
        expect(res4a.completionSatisfied).toBe(true);
        expect(res4a.attendanceRatio).toBe('0.8000');
        expect(res4a.academicEligibility).toBe('ELIGIBLE');
        expect(res4a.financialHold).toBe(false);
        expect(res4a.overallEligibility).toBe(true);

        const cert4 = await certsService.issue(
          adminAccess,
          c4a.enrollment.id,
          randomUUID(),
          randomUUID(),
        );
        expect(cert4.validityStatus).toBe('ISSUED');

        // CASE 4b: COMPLETED enrollment + below 80% (79/100) => ineligible
        const c4b = await createTestEnrollment(transaction, fx, 'COMPLETED');
        await setAttendance(transaction, fx, sessions, c4b.enrollment.id, c4b.user.id, 79);
        await setupFinance(transaction, fx, c4b.enrollment.id, c4b.user.id, c4b.billing.id, true);

        const res4b = await certRead.checkEligibility(c4b.access, c4b.enrollment.id);
        expect(res4b.completionSatisfied).toBe(true);
        expect(res4b.attendanceRatio).toBe('0.7900');
        expect(res4b.academicEligibility).toBe('INELIGIBLE');
        expect(res4b.overallEligibility).toBe(false);

        const issueErr4b = (await certsService
          .issue(adminAccess, c4b.enrollment.id, randomUUID(), randomUUID())
          .catch((error: unknown) => error)) as { response?: Record<string, unknown> };
        expect(issueErr4b.response).toMatchObject({
          code: 'CERTIFICATE_ACADEMIC_INELIGIBLE',
        });
      }),
    30_000,
  );
});
