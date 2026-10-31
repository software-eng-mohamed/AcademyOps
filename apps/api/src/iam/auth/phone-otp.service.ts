import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../../platform/audit/audit.service';
import { PrismaService } from '../../platform/database/prisma.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { OtpChannelAvailabilityService } from '../../messaging/otp-channel-availability.service';
import { encryptActionToken } from './action-token';
import { MfaService } from './mfa.service';
import {
  digestPhoneOtp,
  normalizePhoneOtpRecipient,
  timingSafeDigestCompare,
} from './phone-otp.helper';
import {
  activeLoginRoleFlags,
  hasRecentPhoneOtpChallenge,
  invalidPhoneOtp,
  isChallengeExpiredOrExhausted,
  recordPhoneOtpFailure,
  verifyUserPassword,
  type VerifyOtpResult,
  type VerifyTransactionResult,
} from './phone-otp-policy.helper';
import type { RequestPhoneOtpDto, VerifyPhoneOtpDto } from './phone-otp.dto';
import { invalidCredentials } from './auth-common';
import { verifyPasswordHash } from './password-verification.helper';
import { issueUserSession, selectLoginSessionPolicy } from './session-cookie.helper';

@Injectable()
export class PhoneOtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mfa: MfaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly otpChannel: OtpChannelAvailabilityService,
  ) {}

  async requestOtp(input: RequestPhoneOtpDto, correlationId: string): Promise<void> {
    const normalizedPhone = normalizePhoneOtpRecipient(input.phone);
    const organization = await this.prisma.organization.findUnique({
      where: { code: input.organizationCode.trim().toUpperCase() },
    });
    if (!organization) {
      await verifyPasswordHash(undefined, input.password);
      throw invalidCredentials();
    }
    await this.otpChannel.assertAvailable(organization.id);
    const identifier = await this.prisma.userLoginIdentifier.findFirst({
      where: {
        organizationId: organization.id,
        type: 'PHONE',
        normalizedValue: normalizedPhone,
        revokedAt: null,
      },
    });
    if (!identifier) {
      await verifyPasswordHash(undefined, input.password);
      throw invalidCredentials();
    }
    const user = await this.prisma.user.findFirst({
      where: { id: identifier.userId, organizationId: organization.id, status: 'ACTIVE' },
    });
    if (!user || !(await verifyUserPassword(user.passwordHash, input.password))) {
      throw invalidCredentials();
    }
    await this.prisma.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid AND organization_id = ${organization.id}::uuid FOR UPDATE`;
      const txIdentifier = await transaction.userLoginIdentifier.findFirst({
        where: {
          id: identifier.id,
          organizationId: organization.id,
          userId: user.id,
          type: 'PHONE',
          normalizedValue: normalizedPhone,
          revokedAt: null,
        },
      });
      const txUser = await transaction.user.findFirst({
        where: { id: user.id, organizationId: organization.id, status: 'ACTIVE' },
      });
      if (!txIdentifier || !txUser) return;
      if (!(await verifyPasswordHash(txUser.passwordHash, input.password))) return;
      const now = new Date();
      if (
        await hasRecentPhoneOtpChallenge(
          transaction,
          organization.id,
          user.id,
          normalizedPhone,
          now,
        )
      )
        return;

      const code = randomInt(100000, 1000000).toString();
      const codeHash = digestPhoneOtp(
        `${code}:${this.config.getOrThrow<string>('PHONE_OTP_PEPPER')}`,
      );
      const codeCipher = encryptActionToken(
        code,
        this.config.getOrThrow<string>('ACTION_TOKEN_ENCRYPTION_KEY'),
      );
      const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);

      await transaction.phoneOtpChallenge.updateMany({
        where: {
          organizationId: organization.id,
          userId: user.id,
          normalizedPhone,
          consumedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });

      const challenge = await transaction.phoneOtpChallenge.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          phoneIdentifierId: txIdentifier.id,
          normalizedPhone,
          codeHash,
          expiresAt,
        },
      });

      await this.audit.write(transaction, {
        organizationId: organization.id,
        action: 'user.phone_otp.request',
        entityType: 'PhoneOtpChallenge',
        entityId: challenge.id,
        correlationId,
        metadata: { userId: user.id },
      });

      await this.outbox.add(transaction, {
        organizationId: organization.id,
        aggregateType: 'User',
        aggregateId: user.id,
        type: 'security.phone_otp_requested',
        payload: {
          userId: user.id,
          phone: normalizedPhone,
          codeCipher,
          expiresAt: expiresAt.toISOString(),
        },
      });
    });
  }

  async verifyOtp(input: VerifyPhoneOtpDto, correlationId: string): Promise<VerifyOtpResult> {
    const normalizedPhone = normalizePhoneOtpRecipient(input.phone);
    if (!/^\d{6}$/.test(input.code)) throw invalidPhoneOtp();

    const organization = await this.prisma.organization.findUnique({
      where: { code: input.organizationCode.trim().toUpperCase() },
    });
    if (!organization) throw invalidPhoneOtp();

    const identifier = await this.prisma.userLoginIdentifier.findFirst({
      where: {
        organizationId: organization.id,
        type: 'PHONE',
        normalizedValue: normalizedPhone,
        revokedAt: null,
      },
    });
    if (!identifier) throw invalidPhoneOtp();

    const user = await this.prisma.user.findFirst({
      where: { id: identifier.userId, organizationId: organization.id, status: 'ACTIVE' },
    });
    if (!user) throw invalidPhoneOtp();

    const result = await this.prisma.serializable<VerifyTransactionResult>(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid AND organization_id = ${organization.id}::uuid FOR UPDATE`;

      const txIdentifier = await transaction.userLoginIdentifier.findFirst({
        where: {
          id: identifier.id,
          organizationId: organization.id,
          userId: user.id,
          type: 'PHONE',
          normalizedValue: normalizedPhone,
          revokedAt: null,
        },
      });
      const txUser = await transaction.user.findFirst({
        where: { id: user.id, organizationId: organization.id, status: 'ACTIVE' },
      });
      if (!txIdentifier || !txUser) return { outcome: 'INVALID' };

      const challenge = await transaction.phoneOtpChallenge.findFirst({
        where: {
          organizationId: organization.id,
          userId: user.id,
          normalizedPhone,
          consumedAt: null,
          revokedAt: null,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!challenge) return { outcome: 'INVALID' };

      const now = new Date();
      if (await isChallengeExpiredOrExhausted(transaction, challenge, now)) {
        return { outcome: 'INVALID' };
      }

      const inputCodeHash = digestPhoneOtp(
        `${input.code}:${this.config.getOrThrow<string>('PHONE_OTP_PEPPER')}`,
      );
      if (!timingSafeDigestCompare(inputCodeHash, challenge.codeHash)) {
        await recordPhoneOtpFailure(transaction, challenge.id, challenge.attempts, now);
        return { outcome: 'INVALID' };
      }

      await transaction.phoneOtpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: now },
      });

      if (!txIdentifier.verifiedAt) {
        await transaction.userLoginIdentifier.update({
          where: { id: txIdentifier.id },
          data: { verifiedAt: now },
        });
      }

      const { hasStaffRole } = await activeLoginRoleFlags(
        transaction,
        organization.id,
        user.id,
        now,
      );

      const mfaResult = await this.mfa.verifyForLogin(
        organization.id,
        user.id,
        input.totpCode,
        input.recoveryCode,
        transaction,
      );
      const mfaSetupRequired = hasStaffRole && mfaResult === 'NOT_CONFIGURED';

      const session = await issueUserSession(
        transaction,
        this.config.getOrThrow<string>('SESSION_PEPPER'),
        {
          organizationId: organization.id,
          userId: user.id,
          mfaVerified: mfaResult === 'VERIFIED',
          policy: selectLoginSessionPolicy(input.rememberMe),
        },
      );

      await this.audit.write(transaction, {
        organizationId: organization.id,
        actorUserId: user.id,
        action: 'user.phone_otp.verify',
        entityType: 'PhoneOtpChallenge',
        entityId: challenge.id,
        correlationId,
        metadata: { phone: normalizedPhone },
      });

      await this.outbox.add(transaction, {
        organizationId: organization.id,
        aggregateType: 'User',
        aggregateId: user.id,
        type: 'security.phone_otp_verified',
        payload: { userId: user.id, phone: normalizedPhone },
      });

      return {
        outcome: 'SUCCESS',
        result: {
          ...session,
          mfaSetupRequired,
          passwordChangeRequired: txUser.mustChangePassword,
        },
      };
    });

    if (result.outcome === 'INVALID') throw invalidPhoneOtp();
    return result.result;
  }
}
