import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../platform/database/prisma.service';
import type { LoginDto } from './auth.dto';
import { invalidCredentials, normalizeIdentifier } from './auth-common';
import { MfaService } from './mfa.service';
import { verifyPasswordHash } from './password-verification.helper';
import {
  issueUserSession,
  type IssuedSession,
  selectLoginSessionPolicy,
} from './session-cookie.helper';

@Injectable()
export class AuthLoginService {
  private readonly logger = new Logger(AuthLoginService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mfa: MfaService,
  ) {}

  async login(input: LoginDto): Promise<
    IssuedSession & {
      mfaSetupRequired: boolean;
      passwordChangeRequired: boolean;
    }
  > {
    const organization = await this.prisma.organization.findUnique({
      where: { code: input.organizationCode.trim().toUpperCase() },
    });
    if (!organization) {
      this.logger.warn(`Login failed: Organization not found for code "${input.organizationCode}"`);
      await verifyPasswordHash(undefined, input.password);
      throw invalidCredentials();
    }

    const normalizedValue = normalizeIdentifier(input.identifierType, input.identifier);
    const identifier = await this.prisma.userLoginIdentifier.findFirst({
      where: {
        organizationId: organization.id,
        type: input.identifierType,
        normalizedValue,
        revokedAt: null,
        verifiedAt: { not: null },
      },
    });
    if (!identifier) {
      this.logger.warn(
        `Login failed: Identifier not found or unverified: "${input.identifier}" (normalized: "${normalizedValue}", type: ${input.identifierType})`,
      );
      await verifyPasswordHash(undefined, input.password);
      throw invalidCredentials();
    }

    const user = await this.prisma.user.findFirst({
      where: { id: identifier.userId, organizationId: organization.id, status: 'ACTIVE' },
    });
    const passwordValid =
      (await verifyPasswordHash(user?.passwordHash, input.password)) ||
      (input.password.trim() !== input.password &&
        (await verifyPasswordHash(user?.passwordHash, input.password.trim())));

    if (!user?.passwordHash || !passwordValid) {
      this.logger.warn(
        `Login failed: Invalid password for identifier: "${input.identifier}" (user: ${user?.id})`,
      );
      throw invalidCredentials();
    }

    this.logger.log(`Login successful for identifier: "${input.identifier}" (userId: ${user.id})`);

    const mfaResult = await this.mfa.verifyForLogin(
      organization.id,
      user.id,
      input.totpCode,
      input.recoveryCode,
    );
    const isMfaSatisfied = mfaResult === 'VERIFIED' || mfaResult === 'NOT_CONFIGURED';

    const sessionPepper = this.config.getOrThrow<string>('SESSION_PEPPER');
    const session = await issueUserSession(this.prisma, sessionPepper, {
      organizationId: organization.id,
      userId: user.id,
      mfaVerified: isMfaSatisfied,
      policy: selectLoginSessionPolicy(input.rememberMe),
    });
    return {
      ...session,
      mfaSetupRequired: false,
      passwordChangeRequired: user.mustChangePassword,
    };
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
