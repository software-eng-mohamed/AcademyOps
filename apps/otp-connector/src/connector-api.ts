import type { ConnectorConfig } from './connector-config';
import { channelStates, type ConnectorChannel, type StatusReport } from './connector-types';

export class ConnectorApi {
  private lastSuccessAt = 0;

  constructor(private readonly config: ConnectorConfig) {}

  healthy(): boolean {
    return this.lastSuccessAt > Date.now() - 15_000;
  }

  async channels(): Promise<ConnectorChannel[]> {
    const value = await this.request('channels', { method: 'GET' });
    if (!isRecord(value) || !Array.isArray(value.channels)) throw new Error('CHANNELS_INVALID');
    return value.channels.map(parseChannel);
  }

  async report(report: StatusReport): Promise<void> {
    await this.request('status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(report),
    });
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    let failure: unknown = new Error('CONNECTOR_API_UNAVAILABLE');
    for (const base of this.config.apiUrls) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4_000);
      try {
        const response = await fetch(new URL(`/api/v1/internal/otp-connector/${path}`, base), {
          ...init,
          headers: { ...init.headers, authorization: `Bearer ${this.config.token}` },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`CONNECTOR_API_${response.status}`);
        this.lastSuccessAt = Date.now();
        return response.status === 204 ? null : response.json();
      } catch (error) {
        failure = error;
      } finally {
        clearTimeout(timeout);
      }
    }
    throw failure;
  }
}

function parseChannel(value: unknown): ConnectorChannel {
  if (!isRecord(value)) throw new Error('CHANNEL_INVALID');
  if (
    typeof value.organizationId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.organizationId,
    ) ||
    typeof value.enabled !== 'boolean' ||
    typeof value.desiredState !== 'string' ||
    !channelStates.includes(value.state as (typeof channelStates)[number]) ||
    !Number.isInteger(value.commandVersion) ||
    !Number.isInteger(value.handledCommandVersion)
  ) {
    throw new Error('CHANNEL_INVALID');
  }
  return value as ConnectorChannel;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
