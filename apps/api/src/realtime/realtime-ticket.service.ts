import { createHash, randomBytes } from 'node:crypto';
import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import type IORedis from 'ioredis';

export const REALTIME_TICKET_REDIS = Symbol('REALTIME_TICKET_REDIS');
const ticketTtlSeconds = 60;

export type RealtimeTicketBinding = {
  sessionId: string;
  organizationId: string;
  userId: string;
};

export class RealtimeTicketError extends Error {}

@Injectable()
export class RealtimeTicketService implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(REALTIME_TICKET_REDIS) private readonly redis: IORedis) {}

  async onModuleInit(): Promise<void> {
    if (this.redis.status === 'wait') await this.redis.connect();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis.status !== 'end') await this.redis.quit();
  }

  async issue(sessionId: string, access: AccessContext) {
    const binding: RealtimeTicketBinding = {
      sessionId,
      organizationId: access.organizationId,
      userId: access.actorUserId,
    };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const ticket = randomBytes(32).toString('base64url');
      const stored = await this.redis.set(
        this.key(ticket),
        JSON.stringify(binding),
        'EX',
        ticketTtlSeconds,
        'NX',
      );
      if (stored === 'OK') {
        return {
          ticket,
          expiresAt: new Date(Date.now() + ticketTtlSeconds * 1_000).toISOString(),
        };
      }
    }
    throw new ServiceUnavailableException({
      code: 'REALTIME_TICKET_UNAVAILABLE',
      messageKey: 'realtime.ticketUnavailable',
    });
  }

  async consume(ticket: string): Promise<RealtimeTicketBinding> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(ticket)) throw new RealtimeTicketError('TICKET_INVALID');
    const raw = await this.redis.getdel(this.key(ticket));
    const binding = this.parseBinding(raw);
    if (!binding) throw new RealtimeTicketError('TICKET_INVALID_OR_EXPIRED');
    return binding;
  }

  private key(ticket: string): string {
    const digest = createHash('sha256').update(ticket).digest('hex');
    return `plg:realtime:ticket:${digest}`;
  }

  private parseBinding(raw: string | null): RealtimeTicketBinding | null {
    if (!raw) return null;
    try {
      const value = JSON.parse(raw) as unknown;
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      const candidate = value as Record<string, unknown>;
      if (
        typeof candidate.sessionId !== 'string' ||
        typeof candidate.organizationId !== 'string' ||
        typeof candidate.userId !== 'string'
      ) {
        return null;
      }
      return {
        sessionId: candidate.sessionId,
        organizationId: candidate.organizationId,
        userId: candidate.userId,
      };
    } catch {
      return null;
    }
  }
}
