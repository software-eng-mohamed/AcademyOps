import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export function assertBusinessAccountTransition(current: string, next?: string): void {
  if (current === 'ARCHIVED' && next === 'ACTIVE') {
    throw new ConflictException({
      code: 'BUSINESS_ACCOUNT_ARCHIVED',
      messageKey: 'businessAccounts.archived',
    });
  }
}

export function rethrowBusinessAccountArchiveConflict(error: unknown): never {
  // The database remains authoritative if enrollment and archival race.
  if (
    error instanceof Prisma.PrismaClientUnknownRequestError &&
    error.message.includes('Business account has non-terminal enrollments')
  ) {
    throw new ConflictException({
      code: 'BUSINESS_ACCOUNT_ACTIVE_ENROLLMENTS',
      messageKey: 'businessAccounts.activeEnrollments',
    });
  }
  throw error;
}
