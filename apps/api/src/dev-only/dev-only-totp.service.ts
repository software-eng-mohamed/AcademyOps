import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  decryptSecret,
  encryptSecret,
  generateTotpCode,
  generateTotpSecret,
} from '../iam/auth/totp';
import { PrismaService } from '../platform/database/prisma.service';

export type DevTotpResponse = {
  code: string;
  email: string;
  expiresAt: string;
  validForSeconds: number;
};

@Injectable()
export class DevOnlyTotpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async currentCode(organizationCode: string, email: string): Promise<DevTotpResponse> {
    this.assertDevelopment();
    const normalizedCode = organizationCode.trim().toUpperCase();
    const normalizedEmail = email.trim().toLowerCase();
    const organization = await this.prisma.organization.findUnique({
      where: { code: normalizedCode },
      select: { id: true },
    });
    if (!organization) throw this.notFound();
    const identifier = await this.prisma.userLoginIdentifier.findFirst({
      where: {
        organizationId: organization.id,
        type: 'EMAIL',
        normalizedValue: normalizedEmail,
        revokedAt: null,
        verifiedAt: { not: null },
      },
      select: { userId: true },
    });
    if (!identifier) throw this.notFound();
    const factor = await this.prisma.mfaFactor.findFirst({
      where: {
        organizationId: organization.id,
        userId: identifier.userId,
        type: 'TOTP',
        verifiedAt: { not: null },
        revokedAt: null,
        secretCipher: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      select: { secretCipher: true },
    });

    let secretCipher = factor?.secretCipher;
    if (!secretCipher) {
      const secret = generateTotpSecret();
      const encryptionKey = this.config.getOrThrow<string>('MFA_ENCRYPTION_KEY');
      secretCipher = encryptSecret(secret, encryptionKey);
      await this.prisma.mfaFactor.create({
        data: {
          organizationId: organization.id,
          userId: identifier.userId,
          type: 'TOTP',
          label: 'Authenticator',
          secretCipher,
          verifiedAt: new Date(),
        },
      });
    }

    const now = Date.now();
    const validForSeconds = 30 - (Math.floor(now / 1_000) % 30);
    const secret = decryptSecret(
      secretCipher,
      this.config.getOrThrow<string>('MFA_ENCRYPTION_KEY'),
    );
    return {
      code: generateTotpCode(secret, now),
      email: normalizedEmail,
      expiresAt: new Date(now + validForSeconds * 1_000).toISOString(),
      validForSeconds,
    };
  }

  private assertDevelopment(): void {
    const isDev = this.config.get<string>('NODE_ENV') === 'development';
    const isEnabled = this.config.get<string>('ENABLE_DEV_TOTP') === 'true';
    if (!isDev && !isEnabled) throw this.notFound();
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'DEV_TOTP_NOT_FOUND',
      messageKey: 'dev.totpNotFound',
    });
  }
}
