import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

export type OutboxInput = {
  organizationId: string;
  aggregateType: string;
  aggregateId: string;
  type: string;
  payload: Prisma.InputJsonValue;
  availableAt?: Date;
};

@Injectable()
export class OutboxService {
  async add(transaction: Prisma.TransactionClient, input: OutboxInput): Promise<void> {
    await transaction.outboxEvent.create({
      data: {
        organizationId: input.organizationId,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        type: input.type,
        payload: input.payload,
        ...(input.availableAt ? { availableAt: input.availableAt } : {}),
      },
    });
  }

  async addMany(transaction: Prisma.TransactionClient, inputs: OutboxInput[]): Promise<void> {
    if (inputs.length === 0) return;
    await transaction.outboxEvent.createMany({
      data: inputs.map((input) => ({
        organizationId: input.organizationId,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        type: input.type,
        payload: input.payload,
        ...(input.availableAt ? { availableAt: input.availableAt } : {}),
      })),
    });
  }
}
