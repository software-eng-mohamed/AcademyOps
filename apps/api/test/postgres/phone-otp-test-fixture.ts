import { randomUUID } from 'node:crypto';
import { hash } from 'argon2';
import type { Prisma } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import { vi } from 'vitest';
import { MfaService } from '../../src/iam/auth/mfa.service';
import { MfaTotpConsumerService } from '../../src/iam/auth/mfa-totp-consumer.service';
import { PhoneOtpService } from '../../src/iam/auth/phone-otp.service';
import { AuditService } from '../../src/platform/audit/audit.service';
import { OutboxService } from '../../src/platform/outbox/outbox.service';
import { createTransactionPrismaAdapter } from './prisma-adapter';
export const phoneOtpPepper = 'phone-otp-pepper-at-least-32-bytes-long';
export const phoneOtpActionKey = 'action-token-encryption-at-least-32-bytes';
export const phoneOtpSessionPepper = 'session-pepper-at-least-32-bytes-long';
export const phoneOtpPassword = 'Strong-password-123!';
function createMockConfig(): ConfigService {
  return {
    getOrThrow: vi.fn((key: string): string => {
      if (key === 'PHONE_OTP_PEPPER') return phoneOtpPepper;
      if (key === 'ACTION_TOKEN_ENCRYPTION_KEY') return phoneOtpActionKey;
      if (key === 'SESSION_PEPPER') return phoneOtpSessionPepper;
      throw new Error(`Unexpected key: ${key}`);
    }),
  } as unknown as ConfigService;
}
export async function createPhoneOtpFixture(transaction: Prisma.TransactionClient) {
  const dbAdapter = createTransactionPrismaAdapter(transaction);
  const config = createMockConfig();
  const audit = new AuditService();
  const outbox = new OutboxService();
  const mfa = new MfaService(dbAdapter, config, audit, outbox, new MfaTotpConsumerService(config));
  const service = new PhoneOtpService(dbAdapter, config, mfa, audit, outbox, {
    assertAvailable: vi.fn().mockResolvedValue(undefined),
  } as never);
  const org = await transaction.organization.create({
    data: {
      code: `ORG-${randomUUID().slice(0, 8)}`.toUpperCase(),
      name: 'Test Org',
    },
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
      passwordHash: await hash(phoneOtpPassword, {
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
    },
  });
  const studentRole = await transaction.role.create({
    data: {
      organizationId: org.id,
      code: 'STUDENT',
      name: 'Student',
    },
  });
  await transaction.userRoleAssignment.create({
    data: { organizationId: org.id, userId: user.id, roleId: studentRole.id },
  });
  return { service, org, user, identifier };
}
