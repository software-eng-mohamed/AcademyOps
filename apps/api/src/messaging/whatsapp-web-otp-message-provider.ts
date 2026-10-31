import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type OtpMessage,
  PermanentOtpDeliveryError,
  RetryableOtpDeliveryError,
} from './otp-message-provider';

@Injectable()
export class WhatsappWebOtpMessageProvider {
  private readonly endpoint: URL | null;
  private readonly token: string | null;

  constructor(@Inject(ConfigService) config: ConfigService) {
    const baseUrl = config.get<string>('OTP_CONNECTOR_URL');
    this.token = config.get<string>('OTP_CONNECTOR_INTERNAL_TOKEN') ?? null;
    this.endpoint = baseUrl ? connectorEndpoint(baseUrl) : null;
  }

  async send(message: OtpMessage): Promise<void> {
    if (!this.endpoint || !this.token) {
      throw new PermanentOtpDeliveryError('OTP_CONNECTOR_NOT_CONFIGURED');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(message),
        signal: controller.signal,
      });
      if (response.ok) return;
      if (response.status === 400 || response.status === 422) {
        throw new PermanentOtpDeliveryError('OTP_CONNECTOR_MESSAGE_REJECTED');
      }
      throw new RetryableOtpDeliveryError('OTP_CONNECTOR_TEMPORARILY_UNAVAILABLE');
    } catch (error) {
      if (
        error instanceof PermanentOtpDeliveryError ||
        error instanceof RetryableOtpDeliveryError
      ) {
        throw error;
      }
      throw new RetryableOtpDeliveryError('OTP_CONNECTOR_NETWORK_FAILURE');
    } finally {
      clearTimeout(timeout);
    }
  }
}

function connectorEndpoint(value: string): URL {
  const base = new URL(value);
  if (base.username || base.password || base.search || base.hash || base.pathname !== '/') {
    throw new Error('OTP_CONNECTOR_URL_INVALID');
  }
  return new URL('/internal/send', base);
}
