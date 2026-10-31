import type { Prisma } from '@prisma/client';

const issuer = 'AcademyOps';

export async function mfaAccountLabel(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
): Promise<string> {
  const email = await transaction.userLoginIdentifier.findFirst({
    where: {
      organizationId,
      userId,
      type: 'EMAIL',
      verifiedAt: { not: null },
      revokedAt: null,
    },
    select: { normalizedValue: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  if (email) return email.normalizedValue.trim().toLowerCase();

  const user = await transaction.user.findFirst({
    where: { id: userId, organizationId },
    select: { personId: true },
  });
  if (!user) return 'AcademyOps account';
  const person = await transaction.person.findFirst({
    where: { id: user.personId, organizationId },
    select: { publicId: true },
  });
  return person?.publicId ?? 'AcademyOps account';
}

export function totpEnrollmentUri(secret: string, accountLabel: string): string {
  const path = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountLabel)}`;
  return `otpauth://totp/${path}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
