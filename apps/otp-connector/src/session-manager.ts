import type { ConnectorApi } from './connector-api';
import type { ConnectorConfig } from './connector-config';
import type { ConnectorChannel, SendRequest } from './connector-types';
import { SentLedger } from './sent-ledger';
import { WhatsappSession } from './whatsapp-session';

const IDEMPOTENCY_TTL_MS = 10 * 60_000;

export class SessionManager {
  private readonly sessions = new Map<string, WhatsappSession>();
  private readonly nextStartAt = new Map<string, number>();
  private readonly sent = new Map<string, number>();
  private readonly inFlight = new Map<string, Promise<void>>();
  private interval: NodeJS.Timeout | null = null;
  private syncing = false;
  private readonly ledger: SentLedger;

  constructor(
    private readonly config: ConnectorConfig,
    private readonly api: ConnectorApi,
  ) {
    this.ledger = new SentLedger(config.sessionPath);
  }

  start(): void {
    void this.sync();
    this.interval = setInterval(() => void this.sync(), this.config.pollIntervalMs);
    this.interval.unref();
  }

  healthy(): boolean {
    return this.api.healthy();
  }

  async stop(): Promise<void> {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    await Promise.all([...this.sessions.values()].map((session) => session.stop(false)));
    this.sessions.clear();
  }

  async send(request: SendRequest): Promise<'sent' | 'duplicate'> {
    this.pruneSent();
    const key = `${request.organizationId}:${request.idempotencyKey}`;
    if (this.sent.has(key)) return 'duplicate';
    if (await this.ledger.has(request.organizationId, request.idempotencyKey)) return 'duplicate';
    const active = this.inFlight.get(key);
    if (active) {
      await active;
      return 'duplicate';
    }
    const session = this.sessions.get(request.organizationId);
    if (!session?.ready || session.closed) throw new Error('OTP_CHANNEL_NOT_READY');
    const operation = session.send(request.to, request.body);
    this.inFlight.set(key, operation);
    try {
      await operation;
      this.sent.set(key, Date.now());
      await this.ledger.record(request.organizationId, request.idempotencyKey);
      return 'sent';
    } finally {
      this.inFlight.delete(key);
    }
  }

  private async sync(): Promise<void> {
    if (this.syncing) return;
    this.syncing = true;
    try {
      const channels = await this.api.channels();
      const visible = new Set(channels.map(({ organizationId }) => organizationId));
      for (const channel of channels) await this.apply(channel);
      for (const [organizationId, session] of this.sessions) {
        if (visible.has(organizationId)) continue;
        await session.stop(false);
        this.sessions.delete(organizationId);
      }
    } catch {
      // Readiness becomes false through ConnectorApi; the next bounded poll retries.
    } finally {
      this.syncing = false;
    }
  }

  private async apply(channel: ConnectorChannel): Promise<void> {
    const current = this.sessions.get(channel.organizationId);
    if (!channel.enabled || channel.desiredState === 'DISCONNECTED') {
      if (current) await current.stop(false);
      this.sessions.delete(channel.organizationId);
      if (channel.handledCommandVersion < channel.commandVersion) {
        await this.api.report({
          organizationId: channel.organizationId,
          commandVersion: channel.commandVersion,
          state: 'DISABLED',
        });
      }
      return;
    }
    if (
      channel.desiredState === 'LOGGED_OUT' &&
      channel.handledCommandVersion < channel.commandVersion
    ) {
      if (current) await current.stop(true);
      this.sessions.delete(channel.organizationId);
      this.launch(channel);
      return;
    }
    if (current && current.commandVersion !== channel.commandVersion) {
      await current.stop(false);
      this.sessions.delete(channel.organizationId);
      this.launch(channel);
      return;
    }
    if (current && !current.closed) return;
    if (current?.closed) this.sessions.delete(channel.organizationId);
    if ((this.nextStartAt.get(channel.organizationId) ?? 0) > Date.now()) return;
    this.launch(channel);
  }

  private launch(channel: ConnectorChannel): void {
    if (this.sessions.size >= this.config.maximumSessions) return;
    const session = new WhatsappSession(
      channel.organizationId,
      channel.commandVersion,
      this.config,
      this.api,
      () => this.nextStartAt.set(channel.organizationId, Date.now() + 5_000),
    );
    this.sessions.set(channel.organizationId, session);
    session.start();
  }

  private pruneSent(): void {
    const cutoff = Date.now() - IDEMPOTENCY_TTL_MS;
    for (const [key, sentAt] of this.sent) if (sentAt < cutoff) this.sent.delete(key);
    void this.ledger.prune().catch(() => undefined);
  }
}
