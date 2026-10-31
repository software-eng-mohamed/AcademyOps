import type { Prisma } from '@prisma/client';
import { UnauthorizedException } from '@nestjs/common';
import type { IssuedSession } from './session-cookie.helper';

import { verifyPasswordHash } from './password-verification.helper';

const otpResendCooldownMs = 90_000;

export type VerifyOtpResult = IssuedSession & {
  mfaSetupRequired: boolean;
  passwordChangeRequired: boolean;
};

export type VerifyTransactionResult =
  | { outcome: 'INVALID' }
  | { outcome: 'SUCCESS'; result: VerifyOtpResult };

export async function verifyUserPassword(
  passwordHash: string | null | undefined,
  password: string,
): Promise<boolean> {
  if (!passwordHash) return false;
  return (
    (await verifyPasswordHash(passwordHash, password)) ||
    (password.trim() !== password && (await verifyPasswordHash(passwordHash, password.trim())))
  );
}

export function invalidPhoneOtp(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'PHONE_OTP_INVALID',
    messageKey: 'auth.phoneOtpInvalid',
  });
}

export async function hasRecentPhoneOtpChallenge(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  normalizedPhone: string,
  now: Date,
): Promise<boolean> {
  const challenge = await transaction.phoneOtpChallenge.findFirst({
    where: {
      organizationId,
      userId,
      normalizedPhone,
      consumedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
      createdAt: { gt: new Date(now.getTime() - otpResendCooldownMs) },
    },
    select: { id: true },
  });
  return challenge !== null;
}

export async function isChallengeExpiredOrExhausted(
  transaction: Prisma.TransactionClient,
  challenge: { id: string; expiresAt: Date; attempts: number },
  now: Date,
): Promise<boolean> {
  if (challenge.expiresAt <= now || challenge.attempts >= 5) {
    await transaction.phoneOtpChallenge.update({
      where: { id: challenge.id },
      data: { revokedAt: now },
    });
    return true;
  }
  return false;
}

export async function recordPhoneOtpFailure(
  transaction: Prisma.TransactionClient,
  challengeId: string,
  currentAttempts: number,
  now: Date,
): Promise<void> {
  const nextAttempts = currentAttempts + 1;
  await transaction.phoneOtpChallenge.update({
    where: { id: challengeId },
    data: {
      attempts: { increment: 1 },
      ...(nextAttempts >= 5 ? { revokedAt: now } : {}),
    },
  });
}

export async function activeLoginRoleFlags(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  now: Date,
): Promise<{ hasStaffRole: boolean; hasStudentRole: boolean }> {
  const assignments = await transaction.userRoleAssignment.findMany({
    where: {
      organizationId,
      userId,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    select: { roleId: true },
  });
  const roles = await transaction.role.findMany({
    where: { organizationId, id: { in: assignments.map(({ roleId }) => roleId) } },
    select: { code: true },
  });
  return {
    hasStaffRole: roles.some(({ code }) => code !== 'STUDENT'),
    hasStudentRole: roles.some(({ code }) => code === 'STUDENT'),
  };
}
