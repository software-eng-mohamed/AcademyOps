import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async serializable<T>(work: (transaction: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const maximumAttempts = 4;
    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      try {
        return await this.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 20_000,
        });
      } catch (error) {
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2034' || String(error.meta?.code) === '40001');
        if (!retryable || attempt === maximumAttempts) throw error;
        await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** (attempt - 1)));
      }
    }
    throw new Error('Serializable transaction retry loop exhausted');
  }
}
