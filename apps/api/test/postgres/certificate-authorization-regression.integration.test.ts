import { afterAll, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import type { AccessContext } from '@academyops/contracts';
import { CertificateReadService } from '../../src/certificates/certificate-read.service';
import { CertificateAccessService } from '../../src/certificates/certificate-access.service';
import { CertificateEligibilityService } from '../../src/certificates/certificate-eligibility.service';
import { CertificateRulesService } from '../../src/certificates/certificate-rules.service';
import { CertificateTokenService } from '../../src/certificates/certificate-token.service';
import { FileStorageService } from '../../src/platform/files/file-storage.service';
import { createTestHarness } from './harness';
import { setupStudentSelfServiceFixture } from './student-self-service-fixture';
import { expectHttpErrorCode } from './error-helper';

const harness = createTestHarness();

harness.databaseDescribe('Certificate Access Authorization Regression', () => {
  afterAll(async () => {
    await harness.prisma.$disconnect();
  });

  it('verifies that Student B cannot access Enrollment A even when visibleEnrollmentIds is non-empty', () =>
    harness.inRollbackTransaction(async (transaction) => {
      const fx = await setupStudentSelfServiceFixture(transaction);
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

      // Access Contexts
      const studentAAccess: AccessContext = {
        organizationId: fx.orgA.id,
        actorUserId: fx.studentAUser.id,
        grants: new Map([['certificates.read', new Set(['S'])]]),
        branchIds: new Set([fx.branchA.id]),
        assignedResourceIds: new Set(),
        studentPersonId: fx.personA.id,
      };

      const studentBAccess: AccessContext = {
        organizationId: fx.orgA.id,
        actorUserId: fx.studentBUser.id,
        grants: new Map([['certificates.read', new Set(['S'])]]),
        branchIds: new Set([fx.branchA.id]),
        assignedResourceIds: new Set(),
        studentPersonId: fx.personB.id,
      };

      const studentCAccess: AccessContext = {
        organizationId: fx.orgB.id,
        actorUserId: fx.studentCUser.id,
        grants: new Map([['certificates.read', new Set(['S'])]]),
        branchIds: new Set([]),
        assignedResourceIds: new Set(),
        studentPersonId: fx.personC.id,
      };

      // 1. Verify Student B's visibleEnrollmentIds is non-empty (contains their own enrollment)
      const visibleIdsForB = await certAccess.visibleEnrollmentIds(
        transaction,
        studentBAccess,
        'certificates.read',
      );
      expect(visibleIdsForB).toContain(fx.enrollmentB.id);
      expect(visibleIdsForB).not.toContain(fx.enrollmentA.id);

      // 2. Assert Student B CANNOT read/authorize Enrollment A (assertEnrollment throws CERTIFICATE_RESOURCE_NOT_FOUND)
      await expectHttpErrorCode(
        () =>
          certAccess.assertEnrollment(
            transaction,
            studentBAccess,
            'certificates.read',
            fx.enrollmentA.id,
          ),
        'CERTIFICATE_RESOURCE_NOT_FOUND',
      );

      // 3. Assert Student B CANNOT read/authorize Enrollment A via checkEligibility (throws CERTIFICATE_RESOURCE_NOT_FOUND)
      await expectHttpErrorCode(
        () => certRead.checkEligibility(studentBAccess, fx.enrollmentA.id),
        'CERTIFICATE_RESOURCE_NOT_FOUND',
      );

      // 4. Retain success path: Student A CAN authorize/read Enrollment A
      const authEnrollmentA = await certAccess.assertEnrollment(
        transaction,
        studentAAccess,
        'certificates.read',
        fx.enrollmentA.id,
      );
      expect(authEnrollmentA.id).toBe(fx.enrollmentA.id);

      // 5. Retain success path: Student B CAN authorize/read Enrollment B
      const authEnrollmentB = await certAccess.assertEnrollment(
        transaction,
        studentBAccess,
        'certificates.read',
        fx.enrollmentB.id,
      );
      expect(authEnrollmentB.id).toBe(fx.enrollmentB.id);

      // 6. Retain cross-org denial: Student C (Org B) cannot read Enrollment A (throws CERTIFICATE_RESOURCE_NOT_FOUND)
      await expectHttpErrorCode(
        () =>
          certAccess.assertEnrollment(
            transaction,
            studentCAccess,
            'certificates.read',
            fx.enrollmentA.id,
          ),
        'CERTIFICATE_RESOURCE_NOT_FOUND',
      );
    }));
});
