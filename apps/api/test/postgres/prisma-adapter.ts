import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../src/platform/database/prisma.service';

export function createTransactionPrismaAdapter(
  transaction: Prisma.TransactionClient,
): PrismaService {
  const adapter = {
    organization: transaction.organization,
    person: transaction.person,
    personContact: transaction.personContact,
    studentProfile: transaction.studentProfile,
    user: transaction.user,
    userLoginIdentifier: transaction.userLoginIdentifier,
    phoneOtpChallenge: transaction.phoneOtpChallenge,
    studentRegistration: transaction.studentRegistration,
    role: transaction.role,
    userRoleAssignment: transaction.userRoleAssignment,
    userSession: transaction.userSession,
    mfaFactor: transaction.mfaFactor,
    mfaRecoveryCode: transaction.mfaRecoveryCode,
    auditEvent: transaction.auditEvent,
    outboxEvent: transaction.outboxEvent,
    $queryRaw: transaction.$queryRaw.bind(transaction),
    $executeRaw: transaction.$executeRaw.bind(transaction),
    $executeRawUnsafe: transaction.$executeRawUnsafe.bind(transaction),
    serializable: async <T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
      await transaction.$executeRawUnsafe('SAVEPOINT serializable_work');
      try {
        const result = await work(transaction);
        await transaction.$executeRawUnsafe('RELEASE SAVEPOINT serializable_work');
        return result;
      } catch (error) {
        await transaction.$executeRawUnsafe('ROLLBACK TO SAVEPOINT serializable_work');
        await transaction.$executeRawUnsafe('RELEASE SAVEPOINT serializable_work');
        throw error;
      }
    },
  };

  return adapter as unknown as PrismaService;
}
