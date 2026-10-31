import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type IORedis from 'ioredis';
import { REALTIME_TICKET_REDIS } from './realtime-ticket.service';

const connectionLimit = 5;
const leaseTtlMs = 120_000;
const keyTtlSeconds = Math.ceil(leaseTtlMs / 1_000) + 10;

const acquireScript = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[4]) then return 0 end
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[3])
redis.call('EXPIRE', KEYS[1], ARGV[5])
return 1
`;

const renewScript = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
local renewed = {}
for index = 4, #ARGV do
  if redis.call('ZSCORE', KEYS[1], ARGV[index]) then
    redis.call('ZADD', KEYS[1], ARGV[2], ARGV[index])
    table.insert(renewed, ARGV[index])
  end
end
if #renewed > 0 then redis.call('EXPIRE', KEYS[1], ARGV[3]) end
return renewed
`;

const releaseScript = `
redis.call('ZREM', KEYS[1], ARGV[1])
if redis.call('ZCARD', KEYS[1]) == 0 then redis.call('DEL', KEYS[1]) end
return 1
`;

export class RealtimeConnectionLimitError extends Error {}
export class RealtimeConnectionLeaseUnavailableError extends Error {}

@Injectable()
export class RealtimeConnectionLeaseService {
  constructor(@Inject(REALTIME_TICKET_REDIS) private readonly redis: IORedis) {}

  createLeaseId(): string {
    return randomUUID();
  }

  async acquire(sessionId: string, leaseId: string): Promise<void> {
    const now = Date.now();
    try {
      const acquired = await this.redis.eval(
        acquireScript,
        1,
        this.key(sessionId),
        now,
        now + leaseTtlMs,
        leaseId,
        connectionLimit,
        keyTtlSeconds,
      );
      if (Number(acquired) !== 1) throw new RealtimeConnectionLimitError('CONNECTION_LIMIT');
    } catch (error) {
      if (error instanceof RealtimeConnectionLimitError) throw error;
      throw new RealtimeConnectionLeaseUnavailableError('CONNECTION_LEASE_UNAVAILABLE');
    }
  }

  async renew(sessionId: string, leaseIds: string[]): Promise<Set<string>> {
    if (!leaseIds.length) return new Set();
    const now = Date.now();
    try {
      const renewed = (await this.redis.eval(
        renewScript,
        1,
        this.key(sessionId),
        now,
        now + leaseTtlMs,
        keyTtlSeconds,
        ...leaseIds,
      )) as unknown[];
      return new Set(renewed.map(String));
    } catch {
      throw new RealtimeConnectionLeaseUnavailableError('CONNECTION_LEASE_UNAVAILABLE');
    }
  }

  async release(sessionId: string, leaseId: string): Promise<void> {
    await this.redis.eval(releaseScript, 1, this.key(sessionId), leaseId).catch(() => undefined);
  }

  private key(sessionId: string): string {
    const digest = createHash('sha256').update(sessionId).digest('hex');
    return `plg:realtime:connections:${digest}`;
  }
}
