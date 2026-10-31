import { randomUUID } from 'node:crypto';
import { hash } from 'argon2';
import { afterAll, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AuditService } from '../src/platform/audit/audit.service';
import { OutboxService } from '../src/platform/outbox/outbox.service';
import { decryptActionToken } from '../src/iam/auth/action-token';
import { MfaService } from '../src/iam/auth/mfa.service';
import { MfaTotpConsumerService } from '../src/iam/auth/mfa-totp-consumer.service';
import { PhoneOtpService } from '../src/iam/auth/phone-otp.service';
import { createTestHarness } from './postgres/harness';
import { createTransactionPrismaAdapter } from './postgres/prisma-adapter';
const { prisma, inRollbackTransaction, databaseDescribe } = createTestHarness();
const phonePepper = 'phone-otp-pepper-at-least-32-bytes-long';
const actionKey = 'action-token-encryption-at-least-32-bytes';
const sessionPepper = 'session-pepper-at-least-32-bytes-long';
const mfaKey = 'm'.repeat(40);
const password = 'Strong-password-123!';
function createMockConfig(): ConfigService {
  return {
    getOrThrow: vi.fn((key: string): string => {
      if (key === 'PHONE_OTP_PEPPER') return phonePepper;
      if (key === 'ACTION_TOKEN_ENCRYPTION_KEY') return actionKey;
      if (key === 'SESSION_PEPPER') return sessionPepper;
      if (key === 'MFA_ENCRYPTION_KEY') return mfaKey;
      throw new Error(`Unexpected key: ${key}`);
    }),
  } as unknown as ConfigService;
}
databaseDescribe('Phone OTP real PostgreSQL MFA rollback integration flow', () => {
  afterAll(async () => prisma.$disconnect());
  it('proves MFA failure rolls back challenge consumption, identifier verification, session creation, audit and outbox', async () => {
    await inRollbackTransaction(async (transaction) => {
      const dbAdapter = createTransactionPrismaAdapter(transaction);
      const config = createMockConfig();
      const audit = new AuditService();
      const outbox = new OutboxService();
      const mfa = new MfaService(
        dbAdapter,
        config,
        audit,
        outbox,
        new MfaTotpConsumerService(config),
      );
      const service = new PhoneOtpService(dbAdapter, config, mfa, audit, outbox, {
        assertAvailable: vi.fn().mockResolvedValue(undefined),
      } as never);
      const orgCode = `ORG-${randomUUID().slice(0, 8)}`.toUpperCase();
      const org = await transaction.organization.create({
        data: { code: orgCode, name: 'Test Org' },
      });
      const person = await transaction.person.create({
        data: {
          organizationId: org.id,
          publicId: `PER-${randomUUID().slice(0, 16)}`,
          name: 'User',
        },
      });
      const user = await transaction.user.create({
        data: {
          organizationId: org.id,
          passwordHash: await hash(password, {
            memoryCost: 19456,
            parallelism: 1,
            timeCost: 2,
            type: 2,
          }),
          personId: person.id,
          status: 'ACTIVE',
        },
      });
      const identifier = await transaction.userLoginIdentifier.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          type: 'PHONE',
          normalizedValue: '+201234567890',
          verifiedAt: null,
        },
      });
      const ownerRole = await transaction.role.create({
        data: { organizationId: org.id, code: 'OWNER', name: 'Owner' },
      });
      await transaction.userRoleAssignment.create({
        data: { organizationId: org.id, userId: user.id, roleId: ownerRole.id },
      });
      await transaction.mfaFactor.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          type: 'TOTP',
          secretCipher: 'cipher-secret',
          verifiedAt: new Date(),
        },
      });
      await service.requestOtp(
        { organizationCode: org.code, password, phone: '+201234567890' },
        'corr-mfa-req',
      );
      const outboxRecord = await transaction.outboxEvent.findFirst({
        where: {
          organizationId: org.id,
          aggregateId: user.id,
          type: 'security.phone_otp_requested',
        },
      });
      expect(outboxRecord).not.toBeNull();
      const code = decryptActionToken(
        (
          outboxRecord!.payload as {
            codeCipher: string;
          }
        ).codeCipher,
        actionKey,
      );
      try {
        await service.verifyOtp(
          { organizationCode: org.code, phone: '+201234567890', code },
          'corr-mfa-fail',
        );
        expect.fail('Should have thrown ConflictException');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ConflictException);
        const resp = (err as ConflictException).getResponse() as {
          code: string;
          messageKey: string;
        };
        expect(resp).toEqual({ code: 'MFA_REQUIRED', messageKey: 'auth.mfaRequired' });
      }
      // Assert rollback state in PostgreSQL
      const challenge = await transaction.phoneOtpChallenge.findFirst({
        where: { organizationId: org.id, userId: user.id },
      });
      expect(challenge).not.toBeNull();
      expect(challenge!.consumedAt).toBeNull();
      expect(challenge!.revokedAt).toBeNull();
      const recheckedIdent = await transaction.userLoginIdentifier.findUnique({
        where: { id: identifier.id },
      });
      expect(recheckedIdent!.verifiedAt).toBeNull();
      const sessionCount = await transaction.userSession.count({
        where: { organizationId: org.id, userId: user.id },
      });
      expect(sessionCount).toBe(0);
      const verifyAuditCount = await transaction.auditEvent.count({
        where: { organizationId: org.id, action: 'user.phone_otp.verify' },
      });
      expect(verifyAuditCount).toBe(0);
      const verifyOutboxCount = await transaction.outboxEvent.count({
        where: { organizationId: org.id, type: 'security.phone_otp_verified' },
      });
      expect(verifyOutboxCount).toBe(0);
    });
  });
});
