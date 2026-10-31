import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SessionAccessService } from '../iam/authorization/session-access.service';
import { RealtimeConnectionLeaseService } from './realtime-connection-lease.service';
import { RealtimeTicketService } from './realtime-ticket.service';

export class RealtimeAuthenticationError extends Error {}

@Injectable()
export class RealtimeAuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly sessions: SessionAccessService,
    private readonly tickets: RealtimeTicketService,
    private readonly connections: RealtimeConnectionLeaseService,
  ) {}

  async authenticate(
    origin: string | undefined,
    _cookieHeader: string | undefined,
    ticket?: string,
    leaseId?: string,
  ) {
    if (origin !== this.config.getOrThrow<string>('WEB_ORIGIN')) {
      throw new RealtimeAuthenticationError('ORIGIN_INVALID');
    }
    if (!ticket) throw new RealtimeAuthenticationError('TICKET_REQUIRED');
    if (!leaseId) throw new RealtimeAuthenticationError('LEASE_ID_REQUIRED');
    const binding = await this.tickets.consume(ticket);
    await this.connections.acquire(binding.sessionId, leaseId);
    try {
      const principal = await this.sessions.revalidateRealtime(binding.sessionId);
      if (
        principal.accessContext.organizationId !== binding.organizationId ||
        principal.accessContext.actorUserId !== binding.userId
      ) {
        throw new RealtimeAuthenticationError('TICKET_BINDING_INVALID');
      }
      return principal;
    } catch (error) {
      await this.connections.release(binding.sessionId, leaseId);
      throw error;
    }
  }
}
