import { PrismaClient, type Prisma } from '@prisma/client';
import { describe, expect } from 'vitest';

class IntentionalRollback extends Error {}

export function createTestHarness() {
  const prisma = new PrismaClient();

  async function inRollbackTransaction(
    work: (transaction: Prisma.TransactionClient) => Promise<void>,
  ): Promise<void> {
    try {
      await prisma.$transaction(async (transaction) => {
        await work(transaction);
        throw new IntentionalRollback();
      });
    } catch (error) {
      if (!(error instanceof IntentionalRollback)) throw error;
    }
  }

  async function expectDatabaseRejection(
    transaction: Prisma.TransactionClient,
    work: () => Promise<unknown>,
  ): Promise<void> {
    await transaction.$executeRawUnsafe('SAVEPOINT expected_rejection');
    let rejected = false;
    try {
      await work();
    } catch {
      rejected = true;
      await transaction.$executeRawUnsafe('ROLLBACK TO SAVEPOINT expected_rejection');
    }
    expect(rejected).toBe(true);
  }

  const databaseDescribe = process.env.DATABASE_URL ? describe : describe.skip;

  return {
    prisma,
    inRollbackTransaction,
    expectDatabaseRejection,
    databaseDescribe,
  };
}
