import { createHash } from 'node:crypto';
import { afterAll, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { decryptActionToken } from '../src/iam/auth/action-token';
import { createTestHarness } from './postgres/harness';
import {
  createPhoneOtpFixture,
  phoneOtpActionKey,
  phoneOtpPassword,
  phoneOtpPepper,
  phoneOtpSessionPepper,
} from './postgres/phone-otp-test-fixture';

const { prisma, inRollbackTransaction, databaseDescribe } = createTestHarness();

databaseDescribe('Phone OTP real PostgreSQL service integration flow', () => {
  afterAll(async () => prisma.$disconnect());

  it('exercises real service flow: request, outbox decryption, wrong attempt cap at 5, expiry, success, and replay denial', async () => {
    await inRollbackTransaction(async (transaction) => {
      const { service, org, user, identifier } = await createPhoneOtpFixture(transaction);

      // 1. Request OTP & prove uppercase org lookup & plaintext non-leakage
      await service.requestOtp(
        { organizationCode: org.code, password: phoneOtpPassword, phone: '+201234567890' },
        'corr-1',
      );

      const outboxRecord = await transaction.outboxEvent.findFirst({
        where: {
          organizationId: org.id,
          aggregateId: user.id,
          type: 'security.phone_otp_requested',
        },
      });
      expect(outboxRecord).not.toBeNull();
      const payload = outboxRecord!.payload as { codeCipher: string; phone: string };
      expect(payload.phone).toBe('+201234567890');
      const decryptedCode = decryptActionToken(payload.codeCipher, phoneOtpActionKey);
      expect(decryptedCode).toMatch(/^\d{6}$/);

      const challenge1 = await transaction.phoneOtpChallenge.findFirst({
        where: { organizationId: org.id, userId: user.id },
      });
      expect(challenge1!.codeHash).not.toContain(decryptedCode);

      const requestAudit = await transaction.auditEvent.findFirst({
        where: { organizationId: org.id, action: 'user.phone_otp.request' },
      });
      expect(requestAudit).not.toBeNull();
      expect(JSON.stringify(requestAudit!.metadata)).not.toContain(decryptedCode);
      expect(JSON.stringify(outboxRecord!.payload)).not.toContain(decryptedCode);

      // 2. Immediate retry is accepted silently but does not spend another OTP message.
      await service.requestOtp(
        { organizationCode: org.code, password: phoneOtpPassword, phone: '+201234567890' },
        'corr-2',
      );

      expect(
        await transaction.phoneOtpChallenge.count({
          where: { organizationId: org.id, userId: user.id },
        }),
      ).toBe(1);
      expect(
        await transaction.outboxEvent.count({
          where: {
            organizationId: org.id,
            aggregateId: user.id,
            type: 'security.phone_otp_requested',
          },
        }),
      ).toBe(1);

      const afterCooldown = Date.now() + 91_000;
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(afterCooldown);
      try {
        await service.requestOtp(
          { organizationCode: org.code, password: phoneOtpPassword, phone: '+201234567890' },
          'corr-2-after-cooldown',
        );
      } finally {
        vi.useRealTimers();
      }

      const challenges = await transaction.phoneOtpChallenge.findMany({
        where: { organizationId: org.id, userId: user.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(challenges).toHaveLength(2);
      expect(challenges[0]!.revokedAt).not.toBeNull();
      expect(challenges[1]!.revokedAt).toBeNull();

      const outboxRecord2 = await transaction.outboxEvent.findFirst({
        where: {
          organizationId: org.id,
          aggregateId: user.id,
          type: 'security.phone_otp_requested',
        },
        orderBy: { createdAt: 'desc' },
      });
      const code2 = decryptActionToken(
        (outboxRecord2!.payload as { codeCipher: string }).codeCipher,
        phoneOtpActionKey,
      );
      expect(code2).toMatch(/^\d{6}$/);

      // 3. Drive challenge through 5 wrong verify calls
      for (let i = 1; i <= 4; i += 1) {
        await expect(
          service.verifyOtp(
            { organizationCode: org.code, phone: '+201234567890', code: '000000' },
            `corr-wrong-${i}`,
          ),
        ).rejects.toThrow(UnauthorizedException);
        const ch = await transaction.phoneOtpChallenge.findUnique({
          where: { id: challenges[1]!.id },
        });
        expect(ch!.attempts).toBe(i);
        expect(ch!.revokedAt).toBeNull();
      }

      await expect(
        service.verifyOtp(
          { organizationCode: org.code, phone: '+201234567890', code: '000000' },
          'corr-wrong-5',
        ),
      ).rejects.toThrow(UnauthorizedException);

      const chAttempt5 = await transaction.phoneOtpChallenge.findUnique({
        where: { id: challenges[1]!.id },
      });
      expect(chAttempt5!.attempts).toBe(5);
      expect(chAttempt5!.revokedAt).not.toBeNull();

      // 4. Verify an already-expired valid challenge
      const expiredCode = '111111';
      const expiredHash = createHash('sha256')
        .update(`${expiredCode}:${phoneOtpPepper}`)
        .digest('hex');
      const pastCreated = new Date(Date.now() - 600000);
      const pastExpires = new Date(Date.now() - 300000);

      const expiredChallenge = await transaction.phoneOtpChallenge.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          phoneIdentifierId: identifier.id,
          normalizedPhone: '+201234567890',
          codeHash: expiredHash,
          createdAt: pastCreated,
          expiresAt: pastExpires,
        },
      });

      await expect(
        service.verifyOtp(
          { organizationCode: org.code, phone: '+201234567890', code: expiredCode },
          'corr-exp',
        ),
      ).rejects.toThrow(UnauthorizedException);

      const chExpiredPersisted = await transaction.phoneOtpChallenge.findUnique({
        where: { id: expiredChallenge.id },
      });
      expect(chExpiredPersisted!.revokedAt).not.toBeNull();

      // 5. Successful login
      await service.requestOtp(
        { organizationCode: org.code, password: phoneOtpPassword, phone: '+201234567890' },
        'corr-3',
      );
      const outboxRecord3 = await transaction.outboxEvent.findFirst({
        where: {
          organizationId: org.id,
          aggregateId: user.id,
          type: 'security.phone_otp_requested',
        },
        orderBy: { createdAt: 'desc' },
      });
      const code3 = decryptActionToken(
        (outboxRecord3!.payload as { codeCipher: string }).codeCipher,
        phoneOtpActionKey,
      );

      const loginResult = await service.verifyOtp(
        {
          organizationCode: org.code,
          phone: '+201234567890',
          code: code3,
          rememberMe: true,
        },
        'corr-succ',
      );
      expect(loginResult.sessionToken).toBeDefined();
      expect(loginResult.csrfToken).toBeDefined();

      const updatedIdentifier = await transaction.userLoginIdentifier.findUnique({
        where: { id: identifier.id },
      });
      expect(updatedIdentifier!.verifiedAt).not.toBeNull();

      const createdSession = await transaction.userSession.findFirst({
        where: { organizationId: org.id, userId: user.id },
      });
      expect(createdSession).not.toBeNull();

      const expectedTokenHash = createHash('sha256')
        .update(`${loginResult.sessionToken}:${phoneOtpSessionPepper}`)
        .digest('hex');
      const expectedCsrfHash = createHash('sha256').update(loginResult.csrfToken).digest('hex');

      expect(createdSession!.tokenHash).toBe(expectedTokenHash);
      expect(createdSession!.csrfSecretHash).toBe(expectedCsrfHash);
      expect(createdSession!.idleTimeoutSeconds).toBe(604_800);
      const diffMs = createdSession!.expiresAt.getTime() - Date.now();
      expect(diffMs).toBeGreaterThan(29.9 * 24 * 3600 * 1000);
      expect(diffMs).toBeLessThan(30.1 * 24 * 3600 * 1000);

      const verifyAudit = await transaction.auditEvent.findFirst({
        where: { organizationId: org.id, action: 'user.phone_otp.verify' },
      });
      expect(verifyAudit).not.toBeNull();

      const verifyOutbox = await transaction.outboxEvent.findFirst({
        where: {
          organizationId: org.id,
          aggregateId: user.id,
          type: 'security.phone_otp_verified',
        },
      });
      expect(verifyOutbox).not.toBeNull();

      // 6. Replay denial assertions
      try {
        await service.verifyOtp(
          { organizationCode: org.code, phone: '+201234567890', code: code3 },
          'corr-replay',
        );
        expect.fail('Should have thrown UnauthorizedException');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(UnauthorizedException);
        const resp = (err as UnauthorizedException).getResponse() as {
          code: string;
          messageKey: string;
        };
        expect(resp).toEqual({
          code: 'PHONE_OTP_INVALID',
          messageKey: 'auth.phoneOtpInvalid',
        });
      }
    });
  });
});
