import { expect, it } from 'vitest';
import { createTestHarness } from './postgres/harness';
import { createTransactionPrismaAdapter } from './postgres/prisma-adapter';
import { expectHttpErrorCode } from './postgres/error-helper';
import { StudentRegistrationService } from '../src/students/student-registration.service';
import { StudentRegistrationReviewService } from '../src/students/student-registration-review.service';
import { AuditService } from '../src/platform/audit/audit.service';
import { OutboxService } from '../src/platform/outbox/outbox.service';
import { AuthService } from '../src/iam/auth/auth.service';
import { AuthLoginService } from '../src/iam/auth/auth-login.service';
import { AuthProfileService } from '../src/iam/auth/auth-profile.service';
import { AuthPasswordService } from '../src/iam/auth/auth-password.service';
import { MfaService } from '../src/iam/auth/mfa.service';
import { MfaTotpConsumerService } from '../src/iam/auth/mfa-totp-consumer.service';
import type { ConfigService } from '@nestjs/config';
const harness = createTestHarness();
harness.databaseDescribe('Student Registration Service - Review Approval & Rejection', () => {
  const mockConfigValue = (key: string): string => {
    if (key === 'SESSION_PEPPER') return 'replace-with-at-least-32-random-bytes';
    if (key === 'MFA_ENCRYPTION_KEY') return 'replace-with-at-least-32-random-bytes';
    if (key === 'MFA_RECOVERY_PEPPER') return 'replace-with-at-least-32-random-bytes';
    return 'mock-secret';
  };
  const configMock = {
    getOrThrow: <T = string>(key: string): T => mockConfigValue(key) as unknown as T,
    get: <T = string>(key: string): T => mockConfigValue(key) as unknown as T,
  } as unknown as ConfigService;
  const proof = {
    verificationMethod: 'IN_PERSON_EMAIL_OWNERSHIP' as const,
    verificationReference: 'AO-PROOF-2026-000123',
  };
  it('requires recorded proof before approval verifies email and enables credentials login', () =>
    harness.inRollbackTransaction(async (transaction) => {
      const org = await transaction.organization.create({
        data: { code: 'INTEG_REV_APP', name: 'Review Approve Org' },
      });
      const studentRole = await transaction.role.create({
        data: {
          organizationId: org.id,
          code: 'STUDENT',
          name: 'Student',
          isSystem: true,
        },
      });
      const actorPerson = await transaction.person.create({
        data: { organizationId: org.id, publicId: 'ACTOR-1', name: 'Reviewer' },
      });
      const actor = await transaction.user.create({
        data: {
          organizationId: org.id,
          personId: actorPerson.id,
          status: 'ACTIVE',
          passwordHash: 'dummy',
          mustChangePassword: false,
        },
      });
      const adapter = createTransactionPrismaAdapter(transaction);
      const audit = new AuditService();
      const outbox = new OutboxService();
      const registerService = new StudentRegistrationService(adapter, audit, outbox);
      const reviewService = new StudentRegistrationReviewService(adapter, audit, outbox);
      const access = {
        organizationId: org.id,
        actorUserId: actor.id,
        grants: new Map(),
        branchIds: new Set<string>(),
        assignedResourceIds: new Set<string>(),
      };
      const regRes = await registerService.register(
        {
          organizationCode: 'INTEG_REV_APP',
          name: 'Ahmed Ali',
          email: 'app@example.com',
          phone: '01033334444',
          password: 'securePassword123!',
          preferredLocale: 'ar',
        },
        'corr-reg-app',
      );
      const mfa = new MfaService(
        adapter,
        configMock,
        audit,
        outbox,
        new MfaTotpConsumerService(configMock),
      );
      const loginService = new AuthLoginService(adapter, configMock, mfa);
      const profileService = new AuthProfileService(adapter, audit);
      const passwordService = new AuthPasswordService(adapter, configMock, audit, outbox);
      const auth = new AuthService(loginService, profileService, passwordService);
      await expect(
        auth.login({
          organizationCode: 'INTEG_REV_APP',
          identifierType: 'EMAIL',
          identifier: 'app@example.com',
          password: 'securePassword123!',
        }),
      ).rejects.toThrow();
      const approved = await reviewService.approve(access, regRes.id, 1, proof, 'corr-approve');
      expect(approved.status).toBe('APPROVED');
      expect(approved.version).toBe(2);
      const user = await transaction.user.findUniqueOrThrow({ where: { id: approved.userId } });
      expect(user.status).toBe('ACTIVE');
      const profile = await transaction.studentProfile.findUniqueOrThrow({
        where: { organizationId_personId: { organizationId: org.id, personId: approved.personId } },
      });
      expect(profile.portalStatus).toBe('ACTIVE');
      const emailId = await transaction.userLoginIdentifier.findFirstOrThrow({
        where: { userId: approved.userId, type: 'EMAIL' },
      });
      expect(emailId.verifiedAt).not.toBeNull();
      const phoneId = await transaction.userLoginIdentifier.findFirstOrThrow({
        where: { userId: approved.userId, type: 'PHONE' },
      });
      expect(phoneId.verifiedAt).toBeNull();
      const assignments = await transaction.userRoleAssignment.findMany({
        where: { userId: approved.userId, roleId: studentRole.id },
      });
      expect(assignments).toHaveLength(1);
      await transaction.$executeRaw`
        INSERT INTO user_role_assignments (id, organization_id, user_id, role_id)
        VALUES (gen_random_uuid(), ${org.id}::uuid, ${approved.userId}::uuid, ${studentRole.id}::uuid)
        ON CONFLICT (organization_id, user_id, role_id) WHERE ends_at IS NULL
        DO NOTHING
      `;
      const assignmentsAfter = await transaction.userRoleAssignment.findMany({
        where: { userId: approved.userId, roleId: studentRole.id },
      });
      expect(assignmentsAfter).toHaveLength(1);
      const audits = await transaction.auditEvent.findMany({
        where: {
          entityType: 'StudentRegistration',
          entityId: regRes.id,
          action: 'student.registration.approved',
        },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0]?.metadata).toEqual(proof);
      const outboxes = await transaction.outboxEvent.findMany({
        where: {
          aggregateType: 'StudentRegistration',
          aggregateId: regRes.id,
          type: 'student.registration.approved',
        },
      });
      expect(outboxes).toHaveLength(1);
      const loginRes = await auth.login({
        organizationCode: 'INTEG_REV_APP',
        identifierType: 'EMAIL',
        identifier: 'app@example.com',
        password: 'securePassword123!',
      });
      expect(loginRes.sessionToken).toBeDefined();
    }));
  it('rejects registration, revokes identifiers, blocks login, and asserts audit/outbox and domain error codes', () =>
    harness.inRollbackTransaction(async (transaction) => {
      const org = await transaction.organization.create({
        data: { code: 'INTEG_REV_REJ', name: 'Review Reject Org' },
      });
      const actorPerson = await transaction.person.create({
        data: { organizationId: org.id, publicId: 'ACTOR-2', name: 'Reviewer 2' },
      });
      const actor = await transaction.user.create({
        data: {
          organizationId: org.id,
          personId: actorPerson.id,
          status: 'ACTIVE',
          passwordHash: 'dummy',
          mustChangePassword: false,
        },
      });
      const adapter = createTransactionPrismaAdapter(transaction);
      const audit = new AuditService();
      const outbox = new OutboxService();
      const registerService = new StudentRegistrationService(adapter, audit, outbox);
      const reviewService = new StudentRegistrationReviewService(adapter, audit, outbox);
      const access = {
        organizationId: org.id,
        actorUserId: actor.id,
        grants: new Map(),
        branchIds: new Set<string>(),
        assignedResourceIds: new Set<string>(),
      };
      const regRes = await registerService.register(
        {
          organizationCode: 'INTEG_REV_REJ',
          name: 'Khaled Ali',
          email: 'rej@example.com',
          phone: '01044445555',
          password: 'securePassword123!',
          preferredLocale: 'en',
        },
        'corr-reg-rej',
      );
      await expectHttpErrorCode(
        () =>
          reviewService.reject(access, regRes.id, 999, 'Rejection reason text', 'corr-mismatch'),
        'VERSION_MISMATCH',
      );
      const rejectionReason = 'Incomplete registration documents provided.';
      const rejected = await reviewService.reject(
        access,
        regRes.id,
        1,
        rejectionReason,
        'corr-reject',
      );
      expect(rejected.status).toBe('REJECTED');
      expect(rejected.rejectionReason).toBe(rejectionReason);
      const user = await transaction.user.findUniqueOrThrow({ where: { id: rejected.userId } });
      expect(user.status).toBe('REJECTED');
      const ids = await transaction.userLoginIdentifier.findMany({
        where: { userId: rejected.userId },
      });
      expect(ids.every((i) => i.revokedAt !== null)).toBe(true);
      const mfa = new MfaService(
        adapter,
        configMock,
        audit,
        outbox,
        new MfaTotpConsumerService(configMock),
      );
      const loginService = new AuthLoginService(adapter, configMock, mfa);
      const profileService = new AuthProfileService(adapter, audit);
      const passwordService = new AuthPasswordService(adapter, configMock, audit, outbox);
      const auth = new AuthService(loginService, profileService, passwordService);
      await expect(
        auth.login({
          organizationCode: 'INTEG_REV_REJ',
          identifierType: 'EMAIL',
          identifier: 'rej@example.com',
          password: 'securePassword123!',
        }),
      ).rejects.toThrow();
      const auditRec = await transaction.auditEvent.findFirstOrThrow({
        where: {
          entityType: 'StudentRegistration',
          entityId: regRes.id,
          action: 'student.registration.rejected',
        },
      });
      const auditAfter = auditRec.after as Record<string, string>;
      expect(auditAfter.rejectionReason).toBe(rejectionReason);
      const outboxRec = await transaction.outboxEvent.findFirstOrThrow({
        where: {
          aggregateType: 'StudentRegistration',
          aggregateId: regRes.id,
          type: 'student.registration.rejected',
        },
      });
      const payload = outboxRec.payload as Record<string, string>;
      expect(payload.email).toBe('rej@example.com');
      expect(payload.preferredLocale).toBe('en');
      expect(payload.reason).toBe(rejectionReason);
      await expectHttpErrorCode(
        () => reviewService.approve(access, regRes.id, 2, proof, 'corr-double'),
        'INVALID_STATUS_TRANSITION',
      );
    }));
});
