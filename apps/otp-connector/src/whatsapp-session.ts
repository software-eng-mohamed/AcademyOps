import { rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { Client, LocalAuth } from 'whatsapp-web.js';
import type { ConnectorConfig } from './connector-config';
import type { ConnectorApi } from './connector-api';

export class WhatsappSession {
  readonly organizationId: string;
  readonly commandVersion: number;
  closed = false;
  ready = false;
  private heartbeat: NodeJS.Timeout | null = null;
  private readonly client: Client;

  constructor(
    organizationId: string,
    commandVersion: number,
    private readonly config: ConnectorConfig,
    private readonly api: ConnectorApi,
    private readonly onClosed: () => void,
  ) {
    this.organizationId = organizationId;
    this.commandVersion = commandVersion;
    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: organizationId,
        dataPath: config.sessionPath,
        rmMaxRetries: 4,
      }),
      authTimeoutMs: 60_000,
      qrMaxRetries: 5,
      takeoverOnConflict: true,
      takeoverTimeoutMs: 5_000,
      puppeteer: {
        executablePath: config.chromePath,
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote',
          '--disable-extensions',
        ],
      },
    });
    this.bindEvents();
  }

  start(): void {
    void this.api
      .report({
        organizationId: this.organizationId,
        commandVersion: this.commandVersion,
        state: 'STARTING',
      })
      .then(() => this.client.initialize())
      .catch((error: unknown) => {
        const detail =
          error instanceof Error ? error.message : 'Unknown browser initialization error';
        process.stderr.write(
          `OTP connector session ${this.organizationId} failed to initialize: ${detail}\n`,
        );
        this.fail('OTP_CONNECTOR_START_FAILED');
      });
  }

  async send(to: string, body: string): Promise<void> {
    if (!this.ready || this.closed) throw new Error('OTP_CHANNEL_NOT_READY');
    const digits = to.slice(1);
    const recipient = await this.client.getNumberId(digits);
    if (!recipient) throw new Error('OTP_RECIPIENT_NOT_REGISTERED');
    await this.client.sendMessage(recipient._serialized, body, { sendSeen: false });
  }

  async stop(deleteAuthentication: boolean): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.ready = false;
    this.clearHeartbeat();
    if (deleteAuthentication) await this.client.logout().catch(() => undefined);
    await this.client.destroy().catch(() => undefined);
    if (deleteAuthentication) await this.removeAuthentication();
  }

  private bindEvents(): void {
    this.client.on('qr', (qr) => {
      if (this.closed) return;
      const expiresAt = new Date(Date.now() + 55_000).toISOString();
      void this.api
        .report({
          organizationId: this.organizationId,
          commandVersion: this.commandVersion,
          state: 'QR_REQUIRED',
          qr,
          qrExpiresAt: expiresAt,
        })
        .catch(() => undefined);
    });
    this.client.on('ready', () => {
      if (this.closed) return;
      this.ready = true;
      const phone = this.client.info?.wid?.user ?? '';
      void this.connected(phone);
      this.heartbeat = setInterval(() => void this.connected(phone), 20_000);
      this.heartbeat.unref();
    });
    this.client.on('auth_failure', () => this.fail('OTP_CONNECTOR_AUTH_FAILED'));
    this.client.on('disconnected', () => this.fail('OTP_CONNECTOR_DISCONNECTED'));
  }

  private async connected(phone: string): Promise<void> {
    await this.api
      .report({
        organizationId: this.organizationId,
        commandVersion: this.commandVersion,
        state: 'CONNECTED',
        ...(phone.length >= 4 ? { phoneMasked: `***${phone.slice(-4)}` } : {}),
      })
      .catch(() => undefined);
  }

  private fail(errorCode: string): void {
    if (this.closed) return;
    this.closed = true;
    this.ready = false;
    this.clearHeartbeat();
    void this.api
      .report({
        organizationId: this.organizationId,
        commandVersion: this.commandVersion,
        state: 'DISCONNECTED',
        errorCode,
      })
      .catch(() => undefined);
    void this.client.destroy().catch(() => undefined);
    this.onClosed();
  }

  private clearHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private async removeAuthentication(): Promise<void> {
    const base = resolve(this.config.sessionPath);
    const target = resolve(base, `session-${this.organizationId}`);
    if (!target.startsWith(`${base}${sep}`)) throw new Error('OTP_SESSION_PATH_INVALID');
    await rm(target, { recursive: true, force: true, maxRetries: 4 });
  }
}
