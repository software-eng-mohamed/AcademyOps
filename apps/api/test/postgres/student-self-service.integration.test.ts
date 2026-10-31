import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import type { AccessContext } from '@academyops/contracts';
import { FinanceInstallmentReadService } from '../../src/finance/finance-installment-read.service';
import { FinanceAccessService } from '../../src/finance/finance-access.service';
import { CertificateReadService } from '../../src/certificates/certificate-read.service';
import { CertificateAccessService } from '../../src/certificates/certificate-access.service';
import { CertificateEligibilityService } from '../../src/certificates/certificate-eligibility.service';
import { CertificateRulesService } from '../../src/certificates/certificate-rules.service';
import { CertificateTokenService } from '../../src/certificates/certificate-token.service';
import { FileStorageService } from '../../src/platform/files/file-storage.service';
import { CatalogService } from '../../src/academic/catalog.service';
import { createTestHarness } from './harness';
import { createCatalogTestModule } from './catalog-test-module';
import { setupStudentSelfServiceFixture } from './student-self-service-fixture';

const harness = createTestHarness();

harness.databaseDescribe('Student Self-Service Scoping and Eligibility', () => {
  afterAll(async () => {
    await harness.prisma.$disconnect();
  });

  it('enforces student S-scope read visibility, calculates ledger allocations, check eligibility, and filters draft sessions', () =>
    harness.inRollbackTransaction(async (transaction) => {
      const fx = await setupStudentSelfServiceFixture(transaction);
      const financeRead = new FinanceInstallmentReadService(fx.adapter, new FinanceAccessService());
      const config = new ConfigService({
        WEB_ORIGIN: 'https://test.com',
        CERTIFICATE_SIGNING_KEY: 'c'.repeat(40),
      });
      const fileStorage = new FileStorageService(config, fx.adapter);
      const tokens = new CertificateTokenService(config);
      const certRules = new CertificateRulesService(fx.adapter);
      const certEligibility = new CertificateEligibilityService(certRules);
      const certAccess = new CertificateAccessService();
      const certRead = new CertificateReadService(
        fx.adapter,
        certAccess,
        certEligibility,
        tokens,
        fileStorage,
      );
      const catalogModule = await createCatalogTestModule(fx.adapter);
      const catalogService = catalogModule.get(CatalogService);

      // Build Access Contexts
      const studentAAccess: AccessContext = {
        organizationId: fx.orgA.id,
        actorUserId: fx.studentAUser.id,
        grants: new Map([
          ['finance.balance.read', new Set(['S'])],
          ['certificates.read', new Set(['S'])],
          ['academic.catalog.read', new Set(['S'])],
        ]),
        branchIds: new Set([fx.branchA.id]),
        assignedResourceIds: new Set(),
        studentPersonId: fx.personA.id,
      };
      const studentBAccess: AccessContext = {
        organizationId: fx.orgA.id,
        actorUserId: fx.studentBUser.id,
        grants: new Map([
          ['finance.balance.read', new Set(['S'])],
          ['certificates.read', new Set(['S'])],
          ['academic.catalog.read', new Set(['S'])],
        ]),
        branchIds: new Set([fx.branchA.id]),
        assignedResourceIds: new Set(),
        studentPersonId: fx.personB.id,
      };
      const studentCAccess: AccessContext = {
        organizationId: fx.orgB.id,
        actorUserId: fx.studentCUser.id,
        grants: new Map([['finance.balance.read', new Set(['S'])]]),
        branchIds: new Set([]),
        assignedResourceIds: new Set(),
        studentPersonId: fx.personC.id,
      };
      const ownerAccess: AccessContext = {
        organizationId: fx.orgA.id,
        actorUserId: fx.studentAUser.id,
        grants: new Map([['academic.catalog.read', new Set(['O'])]]),
        branchIds: new Set([]),
        assignedResourceIds: new Set(),
      };

      // Test Installment Read Scoping and Allocation Calculation
      const instPage = await financeRead.listInstallments(studentAAccess, fx.enrollmentA.id, {
        limit: 10,
      });
      expect(instPage.items).toHaveLength(2);
      expect(instPage.items[0]).toMatchObject({
        ordinal: 1,
        originalAmount: '100.00',
        allocatedAmount: '40.00',
        outstandingAmount: '60.00',
        state: 'OVERDUE',
      });
      expect(instPage.items[1]).toMatchObject({
        ordinal: 2,
        originalAmount: '100.00',
        allocatedAmount: '0.00',
        outstandingAmount: '100.00',
        state: 'UPCOMING',
      });

      // Cross-student visibility check
      await harness.expectDatabaseRejection(transaction, () =>
        financeRead.listInstallments(studentBAccess, fx.enrollmentA.id, { limit: 10 }),
      );

      // Cross-organization visibility check
      await harness.expectDatabaseRejection(transaction, () =>
        financeRead.listInstallments(studentCAccess, fx.enrollmentA.id, { limit: 10 }),
      );

      // Test Certificate Eligibility
      // Verify domain error for missing certificate rule
      await harness.expectDatabaseRejection(transaction, () =>
        certRead.checkEligibility(studentAAccess, fx.enrollmentA.id),
      );

      // Create a Certificate Rule and test again
      const rule = await transaction.certificateRuleVersion.create({
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

      // Assert eligibility check is read-only (count is unchanged before and after)
      const countBefore = await transaction.eligibilityEvaluation.count();
      const eligibilityRes = await certRead.checkEligibility(studentAAccess, fx.enrollmentA.id);
      const countAfter = await transaction.eligibilityEvaluation.count();
      expect(countBefore).toBe(countAfter);

      expect(eligibilityRes).toMatchObject({
        minimumRatio: '0.8000',
        overallEligibility: false,
        financialHold: true,
        outstanding: '160.00',
        completionSatisfied: false,
        ruleId: rule.id,
      });

      // Assert student B cannot check eligibility for enrollment A (cross-student rejection)
      await harness.expectDatabaseRejection(transaction, () =>
        certRead.checkEligibility(studentBAccess, fx.enrollmentA.id),
      );

      // Test Calendar DRAFT/CANCELLED Scoping
      const cohortModule = await transaction.cohortModule.create({
        data: {
          organizationId: fx.orgA.id,
          cohortId: fx.cohortA.id,
          programVersionModuleId: fx.pvmA.id,
          ordinal: 1,
        },
      });

      const sessionPublished = await transaction.session.create({
        data: {
          organizationId: fx.orgA.id,
          cohortId: fx.cohortA.id,
          cohortModuleId: cohortModule.id,
          ordinal: 1,
          startsAt: new Date('2026-08-15T10:00:00Z'),
          status: 'SCHEDULED',
          deliveryMode: 'IN_PERSON',
        },
      });
      const sessionDraft = await transaction.session.create({
        data: {
          organizationId: fx.orgA.id,
          cohortId: fx.cohortA.id,
          cohortModuleId: cohortModule.id,
          ordinal: 2,
          startsAt: new Date('2026-08-16T10:00:00Z'),
          status: 'DRAFT',
          deliveryMode: 'IN_PERSON',
        },
      });
      const sessionCancelled = await transaction.session.create({
        data: {
          organizationId: fx.orgA.id,
          cohortId: fx.cohortA.id,
          cohortModuleId: cohortModule.id,
          ordinal: 3,
          startsAt: new Date('2026-08-17T10:00:00Z'),
          status: 'CANCELLED',
          deliveryMode: 'IN_PERSON',
        },
      });

      // Student sees SCHEDULED+CANCELLED but not DRAFT
      const calendarResult = await catalogService.readCalendar(studentAAccess, {
        from: '2026-08-01',
        to: '2026-08-30',
      });
      const sessionIds = calendarResult.items.map((s) => s.id);
      expect(sessionIds).toContain(sessionPublished.id);
      expect(sessionIds).toContain(sessionCancelled.id);
      expect(sessionIds).not.toContain(sessionDraft.id);

      // Owner (O-scope) sees all sessions including DRAFT
      const ownerCalendarResult = await catalogService.readCalendar(ownerAccess, {
        from: '2026-08-01',
        to: '2026-08-30',
      });
      const ownerSessionIds = ownerCalendarResult.items.map((s) => s.id);
      expect(ownerSessionIds).toContain(sessionPublished.id);
      expect(ownerSessionIds).toContain(sessionCancelled.id);
      expect(ownerSessionIds).toContain(sessionDraft.id);
      await catalogModule.close();

      // Test fully satisfied eligibility gates path
      await transaction.enrollment.update({
        where: { id: fx.enrollmentA.id },
        data: { state: 'ACTIVE' },
      });
      await transaction.enrollment.update({
        where: { id: fx.enrollmentA.id },
        data: { state: 'COMPLETED' },
      });

      const credit2 = await transaction.ledgerEntry.create({
        data: {
          organizationId: fx.orgA.id,
          billingAccountId: fx.billingA.id,
          enrollmentId: fx.enrollmentA.id,
          direction: 'CREDIT',
          entryType: 'PAYMENT',
          amount: '160.00',
          sourceType: 'PAYMENT',
          sourceId: randomUUID(),
        },
      });

      await transaction.ledgerAllocation.create({
        data: {
          organizationId: fx.orgA.id,
          creditEntryId: credit2.id,
          debitEntryId: fx.debit1.id,
          amount: '60.00',
          createdBy: fx.studentAUser.id,
        },
      });

      await transaction.ledgerAllocation.create({
        data: {
          organizationId: fx.orgA.id,
          creditEntryId: credit2.id,
          debitEntryId: fx.debit2.id,
          amount: '100.00',
          createdBy: fx.studentAUser.id,
        },
      });

      // Create attendance record to satisfy minimum ratio (1.0000 >= 0.8000)
      await transaction.attendanceRecord.create({
        data: {
          organizationId: fx.orgA.id,
          enrollmentId: fx.enrollmentA.id,
          sessionId: sessionPublished.id,
          currentStatus: 'PRESENT',
          version: 1,
          source: 'MANUAL',
          recordedAt: new Date(),
          recordedBy: fx.studentAUser.id,
        },
      });

      const satisfiedEligibility = await certRead.checkEligibility(
        studentAAccess,
        fx.enrollmentA.id,
      );
      expect(satisfiedEligibility).toMatchObject({
        attendanceRatio: '1.0000',
        minimumRatio: '0.8000',
        academicEligibility: 'ELIGIBLE',
        financialHold: false,
        outstanding: '0.00',
        completionSatisfied: true,
        overallEligibility: true,
      });
    }));
});
