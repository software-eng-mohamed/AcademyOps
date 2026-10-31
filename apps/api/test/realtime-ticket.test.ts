import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AccessContext } from '@academyops/contracts';
import type IORedis from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import { RealtimeAuthService } from '../src/realtime/realtime-auth.service';
import type { RealtimeConnectionLeaseService } from '../src/realtime/realtime-connection-lease.service';
import { RealtimeConnectionLimitError } from '../src/realtime/realtime-connection-lease.service';
import {
  RealtimeTicketError,
  RealtimeTicketService,
} from '../src/realtime/realtime-ticket.service';
import type { SessionAccessService } from '../src/iam/authorization/session-access.service';

const origin = 'https://academy.example.com';

describe('realtime one-time tickets', () => {
  it('stores only a digest key and consumes a session-bound ticket once', async () => {
    const redis = new FakeRedis();
    const service = new RealtimeTicketService(redis as unknown as IORedis);
    const issued = await service.issue('session-a', accessFixture());

    expect(issued.ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect([...redis.values.keys()][0]).not.toContain(issued.ticket);
    expect(redis.lastSetOptions).toEqual(['EX', 60, 'NX']);
    await expect(service.consume(issued.ticket)).resolves.toEqual({
      sessionId: 'session-a',
      organizationId: 'org-a',
      userId: 'user-a',
    });
    await expect(service.consume(issued.ticket)).rejects.toBeInstanceOf(RealtimeTicketError);
  });

  it('rejects an expired or malformed ticket', async () => {
    const service = new RealtimeTicketService(new FakeRedis() as unknown as IORedis);
    await expect(service.consume('a'.repeat(43))).rejects.toThrow('TICKET_INVALID_OR_EXPIRED');
    await expect(service.consume('not-a-ticket')).rejects.toThrow('TICKET_INVALID');
  });

  it('checks exact Origin before atomically consuming a ticket', async () => {
    const tickets = { consume: vi.fn() };
    const auth = new RealtimeAuthService(
      new ConfigService({ WEB_ORIGIN: origin }),
      {} as SessionAccessService,
      tickets as unknown as RealtimeTicketService,
      connectionFixture() as unknown as RealtimeConnectionLeaseService,
    );

    await expect(
      auth.authenticate('https://evil.example.com', undefined, 'a'.repeat(43)),
    ).rejects.toThrow('ORIGIN_INVALID');
    expect(tickets.consume).not.toHaveBeenCalled();
  });

  it('burns the ticket then rejects a revoked session during revalidation', async () => {
    const tickets = {
      consume: vi.fn().mockResolvedValue({
        sessionId: 'session-a',
        organizationId: 'org-a',
        userId: 'user-a',
      }),
    };
    const sessions = {
      revalidateRealtime: vi.fn().mockRejectedValue(new UnauthorizedException()),
    };
    const connections = connectionFixture();
    const auth = new RealtimeAuthService(
      new ConfigService({ WEB_ORIGIN: origin }),
      sessions as unknown as SessionAccessService,
      tickets as unknown as RealtimeTicketService,
      connections as unknown as RealtimeConnectionLeaseService,
    );

    await expect(
      auth.authenticate(origin, undefined, 'a'.repeat(43), 'lease-a'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tickets.consume).toHaveBeenCalledTimes(1);
    expect(connections.release).toHaveBeenCalledWith('session-a', 'lease-a');
    expect(sessions.revalidateRealtime).toHaveBeenCalledWith('session-a');
  });

  it('rejects a ticket whose server-side session binding changed tenants', async () => {
    const tickets = {
      consume: vi.fn().mockResolvedValue({
        sessionId: 'session-a',
        organizationId: 'org-a',
        userId: 'user-a',
      }),
    };
    const sessions = {
      revalidateRealtime: vi.fn().mockResolvedValue({
        sessionId: 'session-a',
        accessContext: { organizationId: 'org-b', actorUserId: 'user-a' },
      }),
    };
    const connections = connectionFixture();
    const auth = new RealtimeAuthService(
      new ConfigService({ WEB_ORIGIN: origin }),
      sessions as unknown as SessionAccessService,
      tickets as unknown as RealtimeTicketService,
      connections as unknown as RealtimeConnectionLeaseService,
    );

    await expect(auth.authenticate(origin, undefined, 'a'.repeat(43), 'lease-a')).rejects.toThrow(
      'TICKET_BINDING_INVALID',
    );
    expect(connections.release).toHaveBeenCalledWith('session-a', 'lease-a');
  });

  it('reserves a distributed connection slot before the expensive session lookup', async () => {
    const tickets = {
      consume: vi.fn().mockResolvedValue({
        sessionId: 'session-a',
        organizationId: 'org-a',
        userId: 'user-a',
      }),
    };
    const sessions = { revalidateRealtime: vi.fn() };
    const connections = {
      acquire: vi.fn().mockRejectedValue(new RealtimeConnectionLimitError('CONNECTION_LIMIT')),
      release: vi.fn(),
    };
    const auth = new RealtimeAuthService(
      new ConfigService({ WEB_ORIGIN: origin }),
      sessions as unknown as SessionAccessService,
      tickets as unknown as RealtimeTicketService,
      connections as unknown as RealtimeConnectionLeaseService,
    );

    await expect(
      auth.authenticate(origin, undefined, 'a'.repeat(43), 'lease-a'),
    ).rejects.toBeInstanceOf(RealtimeConnectionLimitError);
    expect(sessions.revalidateRealtime).not.toHaveBeenCalled();
    expect(connections.release).not.toHaveBeenCalled();
  });
});

function connectionFixture() {
  return {
    acquire: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
  };
}

class FakeRedis {
  readonly status = 'ready';
  readonly values = new Map<string, string>();
  lastSetOptions: unknown[] = [];

  set(key: string, value: string, ...options: unknown[]): Promise<'OK'> {
    this.values.set(key, value);
    this.lastSetOptions = options;
    return Promise.resolve('OK');
  }

  getdel(key: string): Promise<string | null> {
    const value = this.values.get(key) ?? null;
    this.values.delete(key);
    return Promise.resolve(value);
  }
}

function accessFixture(): AccessContext {
  return {
    organizationId: 'org-a',
    actorUserId: 'user-a',
    grants: new Map(),
    branchIds: new Set(),
    assignedResourceIds: new Set(),
  };
}
