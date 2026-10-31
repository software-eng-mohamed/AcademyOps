import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MfaFactor, Prisma } from '@prisma/client';
import type { PrismaService } from '../../platform/database/prisma.service';
import { decryptSecret, matchingTotpCounter } from './totp';

type Database = Prisma.TransactionClient | PrismaService;
type TotpFactor = Pick<
  MfaFactor,
  'id' | 'organizationId' | 'userId' | 'secretCipher' | 'lastUsedCounter'
>;

@Injectable()
export class MfaTotpConsumerService {
  constructor(private readonly config: ConfigService) {}

  async consume(database: Database, factors: TotpFactor[], code: string): Promise<boolean> {
    for (const factor of factors) {
      if (!factor.secretCipher) continue;
      const secret = decryptSecret(
        factor.secretCipher,
        this.config.getOrThrow<string>('MFA_ENCRYPTION_KEY'),
      );
      const counter = matchingTotpCounter(secret, code);
      if (counter === null) continue;
      const accepted = await database.mfaFactor.updateMany({
        where: {
          id: factor.id,
          organizationId: factor.organizationId,
          userId: factor.userId,
          revokedAt: null,
          OR: [{ lastUsedCounter: null }, { lastUsedCounter: { lt: BigInt(counter) } }],
        },
        data: { lastUsedCounter: BigInt(counter) },
      });
      if (accepted.count === 1) return true;
    }
    return false;
  }
}
