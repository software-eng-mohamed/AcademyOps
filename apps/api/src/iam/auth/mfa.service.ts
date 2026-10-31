import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { hasFreshStepUp, type AccessContext } from '@academyops/contracts';
import { AuditService } from '../../platform/audit/audit.service';
import { PrismaService } from '../../platform/database/prisma.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { freshMfaRequired, invalidMfaCode } from './mfa-errors';
import { mfaAccountLabel, totpEnrollmentUri } from './mfa-enrollment-label';
import { generateRecoveryCode, recoveryCodeDigest } from './recovery-codes';
import { encryptSecret, generateTotpSecret } from './totp';
import { MfaTotpConsumerService } from './mfa-totp-consumer.service';

const recoveryCodeCount = 10;

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly totp: MfaTotpConsumerService,
  ) {}

  async beginEnrollment(access: AccessContext, label: string | undefined) {
    const { organizationId, actorUserId } = access;
    const verifiedFactors = await this.prisma.mfaFactor.count({
      where: {
        organizationId,
        userId: actorUserId,
        verifiedAt: { not: null },
        revokedAt: null,
      },
    });
    if (verifiedFactors > 0 && !hasFreshStepUp(access)) throw freshMfaRequired();

    return this.prisma.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM users WHERE id = ${actorUserId}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
      await transaction.mfaFactor.updateMany({
        where: {
          organizationId,
          userId: actorUserId,
          verifiedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      const secret = generateTotpSecret();
      const accountLabel = await mfaAccountLabel(transaction, organizationId, actorUserId);
      const factor = await transaction.mfaFactor.create({
        data: {
          organizationId,
          userId: actorUserId,
          type: 'TOTP',
          label: label ?? 'Authenticator',
          secretCipher: encryptSecret(secret, this.key()),
        },
      });
      return {
        factorId: factor.id,
        secret,
        otpauthUri: totpEnrollmentUri(secret, accountLabel),
      };
    });
  }

  async verifyEnrollment(
    access: AccessContext,
    sessionId: string,
    factorId: string,
    code: string,
    correlationId: string,
  ) {
    return this.prisma.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM mfa_factors WHERE id = ${factorId}::uuid AND organization_id = ${access.organizationId}::uuid FOR UPDATE`;
      const factor = await transaction.mfaFactor.findFirst({
        where: {
          id: factorId,
          organizationId: access.organizationId,
          userId: access.actorUserId,
          type: 'TOTP',
          revokedAt: null,
        },
      });
      if (!factor?.secretCipher) throw invalidMfaCode();
      if (factor.verifiedAt) {
        throw new ConflictException({
          code: 'MFA_FACTOR_ALREADY_VERIFIED',
          messageKey: 'auth.mfaFactorAlreadyVerified',
        });
      }
      const otherVerifiedFactors = await transaction.mfaFactor.count({
        where: {
          organizationId: access.organizationId,
          userId: access.actorUserId,
          id: { not: factor.id },
          verifiedAt: { not: null },
          revokedAt: null,
        },
      });
      if (otherVerifiedFactors > 0 && !hasFreshStepUp(access)) throw freshMfaRequired();
      if (!(await this.totp.consume(transaction, [factor], code))) throw invalidMfaCode();

      const now = new Date();
      await transaction.mfaFactor.update({ where: { id: factor.id }, data: { verifiedAt: now } });
      const recoveryCodes = await this.replaceRecoveryCodes(
        transaction,
        access,
        sessionId,
        correlationId,
        'mfa.factor.enrolled',
      );
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'mfa.factor.enroll',
        entityType: 'MfaFactor',
        entityId: factor.id,
        correlationId,
        after: { type: factor.type, label: factor.label },
      });
      return { verifiedAt: now.toISOString(), recoveryCodes };
    });
  }

  async regenerateRecoveryCodes(
    access: AccessContext,
    sessionId: string,
    correlationId: string,
  ): Promise<{ recoveryCodes: string[] }> {
    if (!hasFreshStepUp(access)) throw freshMfaRequired();
    return this.prisma.serializable(async (transaction) => ({
      recoveryCodes: await this.replaceRecoveryCodes(
        transaction,
        access,
        sessionId,
        correlationId,
        'mfa.recovery_codes.regenerated',
      ),
    }));
  }

  async stepUp(access: AccessContext, sessionId: string, code: string) {
    const factors = await this.prisma.mfaFactor.findMany({
      where: {
        organizationId: access.organizationId,
        userId: access.actorUserId,
        type: 'TOTP',
        verifiedAt: { not: null },
        revokedAt: null,
      },
    });
    if (!(await this.totp.consume(this.prisma, factors, code))) throw invalidMfaCode();
    const now = new Date();
    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { mfaVerifiedAt: now },
    });
    return { verifiedAt: now.toISOString(), validForSeconds: 600 };
  }

  async verifyForLogin(
    organizationId: string,
    userId: string,
    code: string | undefined,
    recoveryCode: string | undefined,
    database: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<'VERIFIED' | 'SETUP_REQUIRED' | 'NOT_CONFIGURED'> {
    const factors = await this.prisma.mfaFactor.findMany({
      where: { organizationId, userId, type: 'TOTP', verifiedAt: { not: null }, revokedAt: null },
    });
    if (!factors.length) return 'NOT_CONFIGURED';
    if (code && recoveryCode) {
      throw new ConflictException({
        code: 'MFA_MULTIPLE_CODES',
        messageKey: 'auth.mfaMultipleCodes',
      });
    }
    if (!code && !recoveryCode) {
      throw new ConflictException({ code: 'MFA_REQUIRED', messageKey: 'auth.mfaRequired' });
    }
    if (code) {
      if (!(await this.totp.consume(database, factors, code))) throw invalidMfaCode();
      return 'VERIFIED';
    }
    if (!(await this.consumeRecoveryCode(organizationId, userId, recoveryCode!))) {
      throw invalidMfaCode();
    }
    return 'VERIFIED';
  }

  private async consumeRecoveryCode(
    organizationId: string,
    userId: string,
    code: string,
  ): Promise<boolean> {
    return this.prisma.serializable(async (transaction) => {
      const codeHash = this.recoveryDigest(code);
      const recovery = await transaction.mfaRecoveryCode.findFirst({
        where: { organizationId, userId, codeHash, usedAt: null, revokedAt: null },
      });
      if (!recovery) return false;
      const used = await transaction.mfaRecoveryCode.updateMany({
        where: { id: recovery.id, usedAt: null, revokedAt: null },
        data: { usedAt: new Date() },
      });
      if (used.count !== 1) return false;
      await transaction.userSession.updateMany({
        where: { organizationId, userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.write(transaction, {
        organizationId,
        actorUserId: userId,
        action: 'mfa.recovery_code.use',
        entityType: 'User',
        entityId: userId,
        correlationId: randomUUID(),
      });
      await this.outbox.add(transaction, {
        organizationId,
        aggregateType: 'User',
        aggregateId: userId,
        type: 'security.mfa_recovery_code.used',
        payload: { userId },
      });
      return true;
    });
  }

  private async replaceRecoveryCodes(
    transaction: Prisma.TransactionClient,
    access: AccessContext,
    sessionId: string,
    correlationId: string,
    eventType: string,
  ): Promise<string[]> {
    const now = new Date();
    await transaction.$queryRaw`SELECT id FROM users WHERE id = ${access.actorUserId}::uuid AND organization_id = ${access.organizationId}::uuid FOR UPDATE`;
    await transaction.mfaRecoveryCode.updateMany({
      where: {
        organizationId: access.organizationId,
        userId: access.actorUserId,
        usedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: now },
    });
    const codes = Array.from({ length: recoveryCodeCount }, () => generateRecoveryCode());
    await transaction.mfaRecoveryCode.createMany({
      data: codes.map((code) => ({
        organizationId: access.organizationId,
        userId: access.actorUserId,
        codeHash: this.recoveryDigest(code),
      })),
    });
    await transaction.userSession.updateMany({
      where: {
        organizationId: access.organizationId,
        userId: access.actorUserId,
        id: { not: sessionId },
        revokedAt: null,
      },
      data: { revokedAt: now },
    });
    await transaction.userSession.update({
      where: { id: sessionId },
      data: { mfaVerifiedAt: now },
    });
    await this.audit.write(transaction, {
      organizationId: access.organizationId,
      actorUserId: access.actorUserId,
      action: eventType,
      entityType: 'User',
      entityId: access.actorUserId,
      correlationId,
    });
    await this.outbox.add(transaction, {
      organizationId: access.organizationId,
      aggregateType: 'User',
      aggregateId: access.actorUserId,
      type: 'security.mfa.changed',
      payload: { userId: access.actorUserId, eventType },
    });
    return codes;
  }

  private recoveryDigest(code: string): string {
    const pepper = this.config.getOrThrow<string>('MFA_RECOVERY_PEPPER');
    return recoveryCodeDigest(code, pepper);
  }

  private key(): string {
    return this.config.getOrThrow<string>('MFA_ENCRYPTION_KEY');
  }
}
