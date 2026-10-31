import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

export type Transaction = Prisma.TransactionClient;

export function notFound(code: string, messageKey: string): NotFoundException {
  return new NotFoundException({ code, messageKey });
}

export function conflict(code: string, messageKey: string): ConflictException {
  return new ConflictException({ code, messageKey });
}

export function versionConflict(): ConflictException {
  return conflict('VERSION_CONFLICT', 'errors.versionConflict');
}

export async function revokeSessions(
  transaction: Transaction,
  organizationId: string,
  userIds: string[],
): Promise<void> {
  if (!userIds.length) return;
  await transaction.userSession.updateMany({
    where: { organizationId, userId: { in: userIds }, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function page<T extends { id: string }>(items: T[], limit: number) {
  const visible = items.slice(0, limit);
  return {
    items: visible,
    nextCursor: items.length > limit ? (visible.at(-1)?.id ?? null) : null,
  };
}
