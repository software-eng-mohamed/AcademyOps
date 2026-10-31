import { createHash } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

export type IdempotencyAttempt<T> =
  | { recordId: string; replayed: false }
  | { recordId: string; replayed: true; response: T };

@Injectable()
export class IdempotencyService {
  async begin<T>(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    operation: string,
    key: string,
    request: unknown,
  ): Promise<IdempotencyAttempt<T>> {
    const lockKey = `${organizationId}:${operation}:${key}`;
    await transaction.$queryRaw<Array<{ locked: string }>>`
      SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS locked
    `;

    const requestHash = this.hash(request);
    const existing = await transaction.idempotencyRecord.findFirst({
      where: { organizationId, operation, key },
    });
    if (existing && existing.expiresAt > new Date()) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException({
          code: 'IDEMPOTENCY_KEY_REUSED',
          messageKey: 'errors.idempotencyKeyReused',
        });
      }
      if (existing.completedAt && existing.responseBody !== null) {
        return {
          recordId: existing.id,
          replayed: true,
          response: existing.responseBody as T,
        };
      }
      throw new ConflictException({
        code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
        messageKey: 'errors.idempotencyRequestInProgress',
      });
    }
    if (existing) await transaction.idempotencyRecord.delete({ where: { id: existing.id } });

    const record = await transaction.idempotencyRecord.create({
      data: {
        organizationId,
        operation,
        key,
        requestHash,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    return { recordId: record.id, replayed: false };
  }

  async complete(
    transaction: Prisma.TransactionClient,
    recordId: string,
    statusCode: number,
    response: unknown,
  ): Promise<void> {
    await transaction.idempotencyRecord.update({
      where: { id: recordId },
      data: {
        statusCode,
        responseBody: JSON.parse(JSON.stringify(response)) as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });
  }

  private hash(value: unknown): string {
    return createHash('sha256').update(this.stableJson(value)).digest('hex');
  }

  private stableJson(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
    if (Array.isArray(value)) return `[${value.map((item) => this.stableJson(item)).join(',')}]`;
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${this.stableJson(item)}`)
      .join(',')}}`;
  }
}
