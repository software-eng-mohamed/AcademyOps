import { Injectable, ServiceUnavailableException, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import { decryptOtpChannelSecret, encryptOtpChannelSecret } from './otp-channel-crypto';

type StoredQr = { qr: string; expiresAt: string };

@Injectable()
export class OtpChannelQrService implements OnModuleDestroy {
  private readonly redis: IORedis;
  private readonly encryptionKey: string | undefined;
  private connectPromise: Promise<void> | null = null;

  constructor(config: ConfigService) {
    this.redis = new IORedis(config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    this.encryptionKey = config.get<string>('WHATSAPP_AUTH_ENCRYPTION_KEY');
  }

  async write(organizationId: string, qr: string, expiresAt: Date): Promise<void> {
    if (qr.length < 20 || qr.length > 8_192) throw new Error('OTP_CHANNEL_QR_INVALID');
    const encryptionKey = this.requireEncryptionKey();
    const ttlSeconds = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
    const value = encryptOtpChannelSecret(
      JSON.stringify({ qr, expiresAt: expiresAt.toISOString() } satisfies StoredQr),
      encryptionKey,
      this.aad(organizationId),
    );
    await this.call(() => this.redis.set(this.key(organizationId), value, 'EX', ttlSeconds));
  }

  async read(organizationId: string): Promise<StoredQr | null> {
    const encryptionKey = this.requireEncryptionKey();
    const value = await this.call(() => this.redis.get(this.key(organizationId)));
    if (!value) return null;
    try {
      const parsed = JSON.parse(
        decryptOtpChannelSecret(value, encryptionKey, this.aad(organizationId)),
      ) as Partial<StoredQr>;
      if (
        typeof parsed.qr !== 'string' ||
        parsed.qr.length < 20 ||
        typeof parsed.expiresAt !== 'string' ||
        !Number.isFinite(Date.parse(parsed.expiresAt)) ||
        Date.parse(parsed.expiresAt) <= Date.now()
      ) {
        return null;
      }
      return { qr: parsed.qr, expiresAt: parsed.expiresAt };
    } catch {
      await this.clear(organizationId);
      return null;
    }
  }

  async clear(organizationId: string): Promise<void> {
    await this.call(() => this.redis.del(this.key(organizationId)));
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis.status === 'ready') await this.redis.quit();
    else this.redis.disconnect();
  }

  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      await this.connectIfNeeded();
      return await operation();
    } catch {
      throw new ServiceUnavailableException({
        code: 'OTP_CHANNEL_QR_UNAVAILABLE',
        messageKey: 'messaging.qrUnavailable',
      });
    }
  }

  private async connectIfNeeded(): Promise<void> {
    if (this.connectPromise) return this.connectPromise;
    if (this.redis.status !== 'wait') return;
    this.connectPromise ??= this.redis.connect().finally(() => {
      this.connectPromise = null;
    });
    await this.connectPromise;
  }

  private key(organizationId: string): string {
    return `plg:whatsapp-otp:qr:v1:${organizationId}`;
  }

  private aad(organizationId: string): string {
    return `whatsapp-otp-qr:v1:${organizationId}`;
  }

  private requireEncryptionKey(): string {
    if (this.encryptionKey) return this.encryptionKey;
    throw new ServiceUnavailableException({
      code: 'OTP_CHANNEL_QR_NOT_CONFIGURED',
      messageKey: 'messaging.qrNotConfigured',
    });
  }
}
