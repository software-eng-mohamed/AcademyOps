import { afterEach, describe, expect, it, vi } from 'vitest';
import { GATEWAY_OPTIONS } from '@nestjs/websockets/constants';
import type { SessionAccessService } from '../src/iam/authorization/session-access.service';
import type { RealtimeAuthService } from '../src/realtime/realtime-auth.service';
import type { RealtimeConnectionLeaseService } from '../src/realtime/realtime-connection-lease.service';
import { RealtimeGateway } from '../src/realtime/realtime.gateway';
import { RealtimeStateService } from '../src/realtime/realtime-state.service';

describe('RealtimeGateway', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('uses a slash-stable websocket path for reverse proxies', () => {
    expect(Reflect.getMetadata(GATEWAY_OPTIONS, RealtimeGateway)).toMatchObject({
      path: '/socket.io',
      addTrailingSlash: false,
      transports: ['websocket'],
    });
  });

  it('joins only server-derived rooms and emits resync on connect', async () => {
    const principal = {
      sessionId: 'session-a',
      isStaff: true,
      isStudent: true,
      accessContext: {
        organizationId: 'org-a',
        actorUserId: 'user-a',
        grants: new Map(),
        branchIds: new Set(),
        assignedResourceIds: new Set(),
        studentPersonId: 'student-a',
      },
    };
    const auth = { authenticate: vi.fn().mockResolvedValue(principal) };
    const state = new RealtimeStateService();
    const gateway = new RealtimeGateway(
      auth as unknown as RealtimeAuthService,
      {} as SessionAccessService,
      state,
      leaseFixture() as unknown as RealtimeConnectionLeaseService,
    );
    const socket = socketFixture();

    await gateway.handleConnection(socket as never);

    expect(socket.join).toHaveBeenCalledWith(['org:org-a:staff', 'org:org-a:student:student-a']);
    expect(socket.join).not.toHaveBeenCalledWith(expect.stringContaining('org-b'));
    expect(socket.emit).toHaveBeenCalledWith(
      'realtime:resync',
      expect.objectContaining({
        v: 1,
        topics: [
          'owner',
          'accounts',
          'attendance',
          'student',
          'calendar',
          'notifications',
          'messaging',
        ],
      }),
    );
    expect(state.snapshot().activeConnections).toBe(1);
  });

  it('disconnects without joining when authentication fails', async () => {
    const auth = { authenticate: vi.fn().mockRejectedValue(new Error('invalid')) };
    const gateway = new RealtimeGateway(
      auth as unknown as RealtimeAuthService,
      {} as SessionAccessService,
      new RealtimeStateService(),
      leaseFixture() as unknown as RealtimeConnectionLeaseService,
    );
    const socket = socketFixture();

    await gateway.handleConnection(socket as never);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('releases a lease when the socket closes while authentication is in flight', async () => {
    let finishAuthentication!: (value: ReturnType<typeof principalFixture>) => void;
    const auth = {
      authenticate: vi.fn().mockReturnValue(
        new Promise((resolve) => {
          finishAuthentication = resolve;
        }),
      ),
    };
    const leases = leaseFixture();
    const gateway = new RealtimeGateway(
      auth as unknown as RealtimeAuthService,
      {} as SessionAccessService,
      new RealtimeStateService(),
      leases as unknown as RealtimeConnectionLeaseService,
    );
    const socket = socketFixture();
    const connection = gateway.handleConnection(socket as never);
    socket.connected = false;
    await gateway.handleDisconnect(socket as never);
    finishAuthentication(principalFixture('session-a'));

    await connection;

    expect(leases.release).toHaveBeenCalledWith('session-a', 'lease-a');
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('passes handshake auth tickets without placing them in the URL', async () => {
    const auth = { authenticate: vi.fn().mockRejectedValue(new Error('stop after capture')) };
    const gateway = new RealtimeGateway(
      auth as unknown as RealtimeAuthService,
      {} as SessionAccessService,
      new RealtimeStateService(),
      leaseFixture() as unknown as RealtimeConnectionLeaseService,
    );
    const socket = socketFixture();
    Object.assign(socket.handshake, { auth: { ticket: 'a'.repeat(43) } });

    await gateway.handleConnection(socket as never);

    expect(auth.authenticate).toHaveBeenCalledWith(
      'https://academy.example.com',
      'plg_session=raw-token',
      'a'.repeat(43),
      'lease-a',
    );
  });

  it('revalidates one session once for all local sockets instead of per socket', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const principal = principalFixture('session-a');
    const auth = { authenticate: vi.fn().mockResolvedValue(principal) };
    const sessions = { revalidateRealtime: vi.fn().mockResolvedValue(principal) };
    const leases = leaseFixture();
    const gateway = new RealtimeGateway(
      auth as unknown as RealtimeAuthService,
      sessions as unknown as SessionAccessService,
      new RealtimeStateService(),
      leases as unknown as RealtimeConnectionLeaseService,
    );
    const sockets = [socketFixture('socket-a'), socketFixture('socket-b')];
    gateway.afterInit(serverFixture(sockets) as never);
    await Promise.all(sockets.map((socket) => gateway.handleConnection(socket as never)));
    gateway.onModuleInit();

    await vi.advanceTimersByTimeAsync(20_250);

    expect(sessions.revalidateRealtime).toHaveBeenCalledTimes(1);
    await gateway.onModuleDestroy();
    vi.useRealTimers();
  });

  it('bounds concurrent revalidation work under a synchronized backlog', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const auth = {
      authenticate: vi
        .fn()
        .mockImplementation((_origin, _cookie, ticket: string) =>
          Promise.resolve(principalFixture(ticket)),
        ),
    };
    const releases: Array<() => void> = [];
    const sessions = {
      revalidateRealtime: vi
        .fn()
        .mockImplementation(
          (sessionId: string) =>
            new Promise((resolve) => releases.push(() => resolve(principalFixture(sessionId)))),
        ),
    };
    let leaseIndex = 0;
    const leases = leaseFixture();
    leases.createLeaseId.mockImplementation(() => `lease-${leaseIndex++}`);
    const gateway = new RealtimeGateway(
      auth as unknown as RealtimeAuthService,
      sessions as unknown as SessionAccessService,
      new RealtimeStateService(),
      leases as unknown as RealtimeConnectionLeaseService,
    );
    const sockets = Array.from({ length: 33 }, (_, index) =>
      socketFixture(`socket-${index}`, `session-${index}`),
    );
    gateway.afterInit(serverFixture(sockets) as never);
    await Promise.all(sockets.map((socket) => gateway.handleConnection(socket as never)));
    gateway.onModuleInit();

    await vi.advanceTimersByTimeAsync(20_000);

    expect(sessions.revalidateRealtime).toHaveBeenCalledTimes(32);
    const destroy = gateway.onModuleDestroy();
    for (const release of releases) release();
    await destroy;
    vi.useRealTimers();
  });
});

function socketFixture(id = 'socket-a', ticket = '') {
  return {
    id,
    connected: true,
    handshake: {
      auth: ticket ? { ticket } : {},
      headers: {
        origin: 'https://academy.example.com',
        cookie: 'plg_session=raw-token',
      },
    },
    data: {},
    rooms: new Set(['socket-id']),
    join: vi.fn().mockResolvedValue(undefined),
    leave: vi.fn().mockResolvedValue(undefined),
    emit: vi.fn(),
    disconnect: vi.fn(),
  };
}

function leaseFixture() {
  return {
    createLeaseId: vi.fn().mockReturnValue('lease-a'),
    renew: vi
      .fn()
      .mockImplementation((_sessionId: string, leaseIds: string[]) =>
        Promise.resolve(new Set(leaseIds)),
      ),
    release: vi.fn().mockResolvedValue(undefined),
  };
}

function principalFixture(sessionId: string) {
  return {
    sessionId,
    isStaff: false,
    isStudent: true,
    accessContext: {
      organizationId: 'org-a',
      actorUserId: `user-${sessionId}`,
      grants: new Map(),
      branchIds: new Set(),
      assignedResourceIds: new Set(),
      studentPersonId: `student-${sessionId}`,
    },
  };
}

function serverFixture(sockets: Array<ReturnType<typeof socketFixture>>) {
  return {
    sockets: { sockets: new Map(sockets.map((socket) => [socket.id, socket])) },
    disconnectSockets: vi.fn(),
  };
}
