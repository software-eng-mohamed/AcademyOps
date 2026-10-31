import { randomBytes } from 'node:crypto';
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AccessContext } from '@academyops/contracts';
import { hash, verify } from 'argon2';
import { normalizeEmail } from '../../imports/normalization';
import { AuditService } from '../../platform/audit/audit.service';
import { PrismaService } from '../../platform/database/prisma.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { encryptActionToken } from './action-token';
import type {
  ChangePasswordDto,
  CompletePasswordResetDto,
  RequestPasswordResetDto,
} from './auth.dto';
import { digest, invalidResetToken } from './auth-common';
import { normalizePhoneOtpRecipient } from './phone-otp.helper';

@Injectable()
export class AuthPasswordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async changePassword(
    access: AccessContext,
    sessionId: string,
    input: ChangePasswordDto,
    correlationId: string,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: access.actorUserId, organizationId: access.organizationId, status: 'ACTIVE' },
    });
    if (!user?.passwordHash || !(await verify(user.passwordHash, input.currentPassword))) {
      throw new UnauthorizedException({
        code: 'CURRENT_PASSWORD_INVALID',
        messageKey: 'auth.currentPasswordInvalid',
      });
    }
    if (await verify(user.passwordHash, input.newPassword)) {
      throw new ConflictException({
        code: 'PASSWORD_REUSE_FORBIDDEN',
        messageKey: 'auth.passwordReuseForbidden',
      });
    }
    const passwordHash = await hash(input.newPassword, {
      type: 2,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid AND organization_id = ${access.organizationId}::uuid FOR UPDATE`;
      await transaction.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          mustChangePassword: false,
          passwordChangedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await transaction.userSession.updateMany({
        where: { organizationId: access.organizationId, userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: user.id,
        action: 'user.password.change',
        entityType: 'User',
        entityId: user.id,
        correlationId,
        metadata: { sessionId },
      });
      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'User',
        aggregateId: user.id,
        type: 'security.password_changed',
        payload: { userId: user.id },
      });
    });
  }

  async requestPasswordReset(input: RequestPasswordResetDto, correlationId: string): Promise<void> {
    const organization = await this.prisma.organization.findUnique({
      where: { code: input.organizationCode.trim().toUpperCase() },
    });
    if (!organization) return;
    const normalizedIdentifier =
      input.identifierType === 'EMAIL'
        ? normalizeEmail(input.identifier)
        : normalizePhoneOtpRecipient(input.identifier);
    if (!normalizedIdentifier) return;
    const identifier = await this.prisma.userLoginIdentifier.findFirst({
      where: {
        organizationId: organization.id,
        type: input.identifierType,
        normalizedValue: normalizedIdentifier,
        verifiedAt: { not: null },
        revokedAt: null,
      },
    });
    if (!identifier) return;
    const user = await this.prisma.user.findFirst({
      where: { id: identifier.userId, organizationId: organization.id, status: 'ACTIVE' },
    });
    if (!user) return;

    const token = randomBytes(32).toString('base64url');
    const tokenHash = digest(`${token}:${this.config.getOrThrow<string>('PASSWORD_RESET_PEPPER')}`);
    const tokenCipher = encryptActionToken(
      token,
      this.config.getOrThrow<string>('ACTION_TOKEN_ENCRYPTION_KEY'),
    );
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await this.prisma.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid AND organization_id = ${organization.id}::uuid FOR UPDATE`;
      await transaction.passwordResetToken.updateMany({
        where: {
          organizationId: organization.id,
          userId: user.id,
          usedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      await transaction.passwordResetToken.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });
      await this.audit.write(transaction, {
        organizationId: organization.id,
        action: 'user.password_reset.request',
        entityType: 'User',
        entityId: user.id,
        correlationId,
      });
      await this.outbox.add(transaction, {
        organizationId: organization.id,
        aggregateType: 'User',
        aggregateId: user.id,
        type: 'security.password_reset_requested',
        payload: {
          userId: user.id,
          identifierType: input.identifierType,
          recipient: normalizedIdentifier,
          locale: input.locale,
          tokenCipher,
          expiresAt: expiresAt.toISOString(),
        },
      });
    });
  }

  async completePasswordReset(
    input: CompletePasswordResetDto,
    correlationId: string,
  ): Promise<void> {
    const organization = await this.prisma.organization.findUnique({
      where: { code: input.organizationCode.trim().toUpperCase() },
    });
    if (!organization) throw invalidResetToken();
    const tokenHash = digest(
      `${input.token}:${this.config.getOrThrow<string>('PASSWORD_RESET_PEPPER')}`,
    );
    const passwordHash = await hash(input.newPassword, {
      type: 2,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    await this.prisma.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM password_reset_tokens WHERE token_hash = ${tokenHash} FOR UPDATE`;
      const resetToken = await transaction.passwordResetToken.findUnique({ where: { tokenHash } });
      if (
        !resetToken ||
        resetToken.organizationId !== organization.id ||
        resetToken.usedAt ||
        resetToken.revokedAt ||
        resetToken.expiresAt <= new Date()
      ) {
        throw invalidResetToken();
      }
      const user = await transaction.user.findFirst({
        where: { id: resetToken.userId, organizationId: organization.id, status: 'ACTIVE' },
      });
      if (!user) throw invalidResetToken();
      if (user.passwordHash && (await verify(user.passwordHash, input.newPassword))) {
        throw new ConflictException({
          code: 'PASSWORD_REUSE_FORBIDDEN',
          messageKey: 'auth.passwordReuseForbidden',
        });
      }
      const now = new Date();
      await transaction.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          mustChangePassword: false,
          passwordChangedAt: now,
          version: { increment: 1 },
        },
      });
      await transaction.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: now },
      });
      await transaction.passwordResetToken.updateMany({
        where: {
          organizationId: organization.id,
          userId: user.id,
          id: { not: resetToken.id },
          usedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
      await transaction.userSession.updateMany({
        where: { organizationId: organization.id, userId: user.id, revokedAt: null },
        data: { revokedAt: now },
      });
      await this.audit.write(transaction, {
        organizationId: organization.id,
        actorUserId: user.id,
        action: 'user.password_reset.complete',
        entityType: 'User',
        entityId: user.id,
        correlationId,
      });
      await this.outbox.add(transaction, {
        organizationId: organization.id,
        aggregateType: 'User',
        aggregateId: user.id,
        type: 'security.password_reset_completed',
        payload: { userId: user.id },
      });
    });
  }
}
