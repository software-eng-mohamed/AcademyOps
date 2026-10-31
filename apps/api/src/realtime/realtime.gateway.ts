import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { SessionAccessService } from '../iam/authorization/session-access.service';
import { RealtimeAuthService } from './realtime-auth.service';
import {
  RealtimeConnectionLeaseService,
  RealtimeConnectionLeaseUnavailableError,
  RealtimeConnectionLimitError,
} from './realtime-connection-lease.service';
import type {
  ClientInvalidation,
  RealtimeFanoutMessage,
  RealtimeResync,
} from './realtime.contracts';
import { resyncTopics, roomsForFanout, roomsForPrincipal } from './realtime-rooms';
import { RealtimeStateService } from './realtime-state.service';

const schedulerTickMs = 250;
const minimumRevalidationDelayMs = 20_000;
const maximumRevalidationDelayMs = 40_000;
const maximumPrincipalAgeMs = 60_000;
const maximumConcurrentRevalidations = 32;
const shutdownReleaseConcurrency = 32;

type ClientEvents = Record<string, never>;
type ServerEvents = {
  'realtime:invalidate': (payload: ClientInvalidation) => void;
  'realtime:resync': (payload: RealtimeResync) => void;
};
type ConnectionState = {
  sessionId: string;
  leaseId: string;
  authenticated: true;
  counted: boolean;
  released: boolean;
};
type SocketData = { realtime?: ConnectionState };
type RealtimeSocket = Socket<ClientEvents, ServerEvents, ClientEvents, SocketData>;
type RealtimeServer = Server<ClientEvents, ServerEvents, ClientEvents, SocketData>;
type SessionSchedule = {
  socketIds: Set<string>;
  nextValidationAt: number;
  lastValidatedAt: number;
  inFlight: boolean;
};

@WebSocketGateway({
  path: '/socket.io',
  addTrailingSlash: false,
  transports: ['websocket'],
  serveClient: false,
})
export class RealtimeGateway
  implements
    OnGatewayInit<RealtimeServer>,
    OnGatewayConnection<RealtimeSocket>,
    OnGatewayDisconnect<RealtimeSocket>,
    OnModuleInit,
    OnModuleDestroy
{
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly sessionSchedules = new Map<string, SessionSchedule>();
  private readonly revalidationTasks = new Set<Promise<void>>();
  private server?: RealtimeServer;
  private schedulerTimer?: NodeJS.Timeout;
  private revalidationsInFlight = 0;
  private destroying = false;

  constructor(
    private readonly auth: RealtimeAuthService,
    private readonly sessions: SessionAccessService,
    private readonly state: RealtimeStateService,
    private readonly leases: RealtimeConnectionLeaseService,
  ) {}

  afterInit(server: RealtimeServer): void {
    this.server = server;
  }

  onModuleInit(): void {
    this.schedulerTimer = setInterval(() => this.dispatchDueRevalidations(), schedulerTickMs);
    this.schedulerTimer.unref();
  }

  async handleConnection(client: RealtimeSocket): Promise<void> {
    const leaseId = this.leases.createLeaseId();
    try {
      const principal = await this.auth.authenticate(
        client.handshake.headers.origin,
        client.handshake.headers.cookie,
        this.ticketFrom(client.handshake.auth),
        leaseId,
      );
      if (!client.connected) {
        await this.leases.release(principal.sessionId, leaseId);
        return;
      }
      client.data.realtime = {
        sessionId: principal.sessionId,
        leaseId,
        authenticated: true,
        counted: false,
        released: false,
      };
      await client.join(roomsForPrincipal(principal));
      client.data.realtime.counted = true;
      this.addToSchedule(principal.sessionId, client.id);
      this.state.connectionOpened();
      client.emit('realtime:resync', {
        v: 1,
        topics: resyncTopics(principal.isStaff, principal.isStudent),
        occurredAt: new Date().toISOString(),
      });
    } catch (error) {
      await this.releaseConnection(client);
      this.state.connectionRejected(this.rejectionReason(error));
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: RealtimeSocket): Promise<void> {
    await this.releaseConnection(client);
  }

  broadcast(message: RealtimeFanoutMessage): void {
    const rooms = roomsForFanout(message);
    if (!this.server || !rooms.length) return;
    this.server.to(rooms).emit('realtime:invalidate', message.invalidation);
  }

  async onModuleDestroy(): Promise<void> {
    this.destroying = true;
    if (this.schedulerTimer) clearInterval(this.schedulerTimer);
    await Promise.allSettled([...this.revalidationTasks]);
    const sockets = this.server ? [...this.server.sockets.sockets.values()] : [];
    for (let index = 0; index < sockets.length; index += shutdownReleaseConcurrency) {
      await Promise.allSettled(
        sockets
          .slice(index, index + shutdownReleaseConcurrency)
          .map((socket) => this.releaseConnection(socket)),
      );
    }
    this.server?.disconnectSockets(true);
    this.sessionSchedules.clear();
  }

  private dispatchDueRevalidations(): void {
    if (!this.server || this.destroying) return;
    const now = Date.now();
    for (const [sessionId, schedule] of this.sessionSchedules) {
      if (now - schedule.lastValidatedAt > maximumPrincipalAgeMs) {
        this.state.overdueSessionDisconnected();
        this.disconnectLocalSession(sessionId, 'revalidation overdue');
        continue;
      }
      if (
        schedule.inFlight ||
        schedule.nextValidationAt > now ||
        this.revalidationsInFlight >= maximumConcurrentRevalidations
      ) {
        continue;
      }
      this.startRevalidation(sessionId, schedule, now);
    }
  }

  private startRevalidation(sessionId: string, schedule: SessionSchedule, startedAt: number): void {
    schedule.inFlight = true;
    this.revalidationsInFlight += 1;
    this.state.revalidationStarted(Math.max(0, startedAt - schedule.nextValidationAt));
    const task = this.revalidateSession(sessionId, schedule, startedAt).finally(() => {
      schedule.inFlight = false;
      this.revalidationsInFlight = Math.max(0, this.revalidationsInFlight - 1);
      this.revalidationTasks.delete(task);
    });
    this.revalidationTasks.add(task);
  }

  private async revalidateSession(
    sessionId: string,
    schedule: SessionSchedule,
    startedAt: number,
  ): Promise<void> {
    let succeeded = false;
    try {
      const principal = await this.sessions.revalidateRealtime(sessionId);
      if (this.destroying || this.sessionSchedules.get(sessionId) !== schedule) return;
      const sockets = this.localSockets(schedule, sessionId);
      const leaseIds = sockets.map(({ data }) => data.realtime!.leaseId);
      const renewed = await this.leases.renew(sessionId, leaseIds);
      for (const socket of sockets) {
        const connection = socket.data.realtime!;
        if (!renewed.has(connection.leaseId)) {
          socket.disconnect(true);
          continue;
        }
        await this.synchronizeRooms(socket, roomsForPrincipal(principal));
      }
      const completedAt = Date.now();
      schedule.lastValidatedAt = completedAt;
      schedule.nextValidationAt = completedAt + this.nextRevalidationDelay();
      succeeded = true;
    } catch (error) {
      this.disconnectLocalSession(
        sessionId,
        `revalidation failed: ${error instanceof Error ? error.name : 'unknown'}`,
      );
    } finally {
      this.state.revalidationFinished(Date.now() - startedAt, succeeded);
    }
  }

  private async synchronizeRooms(socket: RealtimeSocket, intendedRooms: string[]): Promise<void> {
    const intended = new Set(intendedRooms);
    const existing = [...socket.rooms].filter((room) => room.startsWith('org:'));
    for (const room of existing) {
      if (!intended.has(room)) await socket.leave(room);
    }
    await socket.join(intendedRooms);
  }

  private localSockets(schedule: SessionSchedule, sessionId: string): RealtimeSocket[] {
    if (!this.server) return [];
    return [...schedule.socketIds]
      .map((socketId) => this.server!.sockets.sockets.get(socketId))
      .filter((socket): socket is RealtimeSocket => socket?.data.realtime?.sessionId === sessionId);
  }

  private disconnectLocalSession(sessionId: string, reason: string): void {
    const schedule = this.sessionSchedules.get(sessionId);
    if (!schedule) return;
    this.sessionSchedules.delete(sessionId);
    this.logger.debug(`Disconnecting realtime session: ${reason}`);
    for (const socket of this.localSockets(schedule, sessionId)) socket.disconnect(true);
  }

  private addToSchedule(sessionId: string, socketId: string): void {
    const now = Date.now();
    const schedule = this.sessionSchedules.get(sessionId) ?? {
      socketIds: new Set<string>(),
      nextValidationAt: now + this.nextRevalidationDelay(),
      lastValidatedAt: now,
      inFlight: false,
    };
    schedule.socketIds.add(socketId);
    schedule.lastValidatedAt = now;
    schedule.nextValidationAt = now + this.nextRevalidationDelay();
    this.sessionSchedules.set(sessionId, schedule);
  }

  private async releaseConnection(client: RealtimeSocket): Promise<void> {
    const connection = client.data.realtime;
    if (!connection?.authenticated || connection.released) return;
    connection.released = true;
    const schedule = this.sessionSchedules.get(connection.sessionId);
    schedule?.socketIds.delete(client.id);
    if (schedule && schedule.socketIds.size === 0) {
      this.sessionSchedules.delete(connection.sessionId);
    }
    if (connection.counted) this.state.connectionClosed();
    await this.leases.release(connection.sessionId, connection.leaseId);
  }

  private nextRevalidationDelay(): number {
    const spread = maximumRevalidationDelayMs - minimumRevalidationDelayMs;
    return minimumRevalidationDelayMs + Math.floor(Math.random() * (spread + 1));
  }

  private rejectionReason(error: unknown): 'authentication' | 'limit' | 'lease-unavailable' {
    if (error instanceof RealtimeConnectionLimitError) return 'limit';
    if (error instanceof RealtimeConnectionLeaseUnavailableError) return 'lease-unavailable';
    return 'authentication';
  }

  private ticketFrom(value: unknown): string | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const record = value as Record<string, unknown>;
    if (!Object.hasOwn(record, 'ticket')) return undefined;
    return typeof record.ticket === 'string' ? record.ticket : '';
  }
}
