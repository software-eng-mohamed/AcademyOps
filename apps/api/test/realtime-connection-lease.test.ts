import IORedis from 'ioredis';
import { describe, expect, it } from 'vitest';
import {
  RealtimeConnectionLeaseService,
  RealtimeConnectionLeaseUnavailableError,
  RealtimeConnectionLimitError,
} from '../src/realtime/realtime-connection-lease.service';

describe('RealtimeConnectionLeaseService', () => {
  it('atomically enforces a global five-connection cap across service instances', async () => {
    const redis = new FakeLeaseRedis();
    const first = new RealtimeConnectionLeaseService(redis as unknown as IORedis);
    const second = new RealtimeConnectionLeaseService(redis as unknown as IORedis);

    await Promise.all([
      first.acquire('session-a', 'lease-1'),
      second.acquire('session-a', 'lease-2'),
      first.acquire('session-a', 'lease-3'),
      second.acquire('session-a', 'lease-4'),
      first.acquire('session-a', 'lease-5'),
    ]);
    await expect(second.acquire('session-a', 'lease-6')).rejects.toBeInstanceOf(
      RealtimeConnectionLimitError,
    );

    await first.release('session-a', 'lease-1');
    await expect(second.acquire('session-a', 'lease-6')).resolves.toBeUndefined();
    expect(redis.lastKey).not.toContain('session-a');
  });

  it('renews only leases that still exist', async () => {
    const redis = new FakeLeaseRedis();
    const service = new RealtimeConnectionLeaseService(redis as unknown as IORedis);
    await service.acquire('session-a', 'lease-a');

    await expect(service.renew('session-a', ['lease-a', 'missing'])).resolves.toEqual(
      new Set(['lease-a']),
    );
  });

  it('fails closed when Redis cannot enforce the distributed cap', async () => {
    const redis = { eval: () => Promise.reject(new Error('offline')) };
    const service = new RealtimeConnectionLeaseService(redis as unknown as IORedis);

    await expect(service.acquire('session-a', 'lease-a')).rejects.toBeInstanceOf(
      RealtimeConnectionLeaseUnavailableError,
    );
  });
});

describe.runIf(process.env.REDIS_URL)('RealtimeConnectionLeaseService with Redis', () => {
  it('executes the atomic scripts consistently across separate Redis clients', async () => {
    const firstRedis = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: 1 });
    const secondRedis = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: 1 });
    const first = new RealtimeConnectionLeaseService(firstRedis);
    const second = new RealtimeConnectionLeaseService(secondRedis);
    const sessionId = `lease-integration-${crypto.randomUUID()}`;
    const leaseIds = Array.from({ length: 6 }, (_, index) => `lease-${index}`);
    try {
      for (const leaseId of leaseIds.slice(0, 5)) await first.acquire(sessionId, leaseId);
      await expect(second.acquire(sessionId, leaseIds[5]!)).rejects.toBeInstanceOf(
        RealtimeConnectionLimitError,
      );
      await first.release(sessionId, leaseIds[0]!);
      await expect(second.acquire(sessionId, leaseIds[5]!)).resolves.toBeUndefined();
      await expect(second.renew(sessionId, leaseIds)).resolves.toEqual(new Set(leaseIds.slice(1)));
    } finally {
      await Promise.all(leaseIds.map((leaseId) => first.release(sessionId, leaseId)));
      await Promise.all([firstRedis.quit(), secondRedis.quit()]);
    }
  });
});

class FakeLeaseRedis {
  readonly leases = new Map<string, Map<string, number>>();
  lastKey = '';

  eval(script: string, _keys: number, key: string, ...args: Array<string | number>) {
    this.lastKey = key;
    const leases = this.leases.get(key) ?? new Map<string, number>();
    this.leases.set(key, leases);
    if (script.includes('>= tonumber(ARGV[4])')) return this.acquire(leases, args);
    if (script.includes('local renewed')) return this.renew(leases, args);
    leases.delete(String(args[0]));
    if (!leases.size) this.leases.delete(key);
    return Promise.resolve(1);
  }

  private acquire(leases: Map<string, number>, args: Array<string | number>) {
    this.prune(leases, Number(args[0]));
    if (leases.size >= Number(args[3])) return Promise.resolve(0);
    leases.set(String(args[2]), Number(args[1]));
    return Promise.resolve(1);
  }

  private renew(leases: Map<string, number>, args: Array<string | number>) {
    this.prune(leases, Number(args[0]));
    const renewed = args
      .slice(3)
      .map(String)
      .filter((leaseId) => leases.has(leaseId));
    for (const leaseId of renewed) leases.set(leaseId, Number(args[1]));
    return Promise.resolve(renewed);
  }

  private prune(leases: Map<string, number>, now: number): void {
    for (const [leaseId, expiresAt] of leases) {
      if (expiresAt <= now) leases.delete(leaseId);
    }
  }
}
