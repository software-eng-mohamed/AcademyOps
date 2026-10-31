import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export type ConnectorConfig = {
  port: number;
  apiUrls: URL[];
  token: string;
  chromePath: string;
  sessionPath: string;
  pollIntervalMs: number;
  maximumSessions: number;
};

export function readConnectorConfig(environment = process.env): ConnectorConfig {
  const production = environment.NODE_ENV === 'production';
  const token = environment.OTP_CONNECTOR_INTERNAL_TOKEN ?? '';
  if (!/^[0-9a-fA-F]{64}$/.test(token)) throw new Error('OTP_CONNECTOR_TOKEN_INVALID');
  const apiUrls = (environment.OTP_CONNECTOR_API_URLS ?? 'http://127.0.0.1:3001')
    .split(',')
    .map((value) => connectorApiUrl(value.trim(), production));
  if (!apiUrls.length || apiUrls.length > 4) throw new Error('OTP_CONNECTOR_API_URLS_INVALID');
  const chromePath = environment.OTP_CONNECTOR_CHROME_PATH ?? defaultChromePath();
  if (!chromePath || !existsSync(chromePath)) throw new Error('OTP_CONNECTOR_CHROME_NOT_FOUND');
  return {
    port: boundedInteger(environment.OTP_CONNECTOR_PORT, 3002, 1, 65_535),
    apiUrls,
    token,
    chromePath,
    sessionPath: resolve(environment.OTP_CONNECTOR_SESSION_PATH ?? '.otp-connector-session'),
    pollIntervalMs: boundedInteger(environment.OTP_CONNECTOR_POLL_MS, 2_000, 1_000, 30_000),
    maximumSessions: boundedInteger(environment.OTP_CONNECTOR_MAX_SESSIONS, 5, 1, 20),
  };
}

function connectorApiUrl(value: string, production: boolean): URL {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('OTP_CONNECTOR_API_URL_INVALID');
  }
  if (production && (url.protocol !== 'http:' || !/^api-[ab]$/.test(url.hostname))) {
    throw new Error('OTP_CONNECTOR_API_URL_INVALID');
  }
  if (!production && !['http:', 'https:'].includes(url.protocol)) {
    throw new Error('OTP_CONNECTOR_API_URL_INVALID');
  }
  return url;
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error('OTP_CONNECTOR_INTEGER_INVALID');
  }
  return parsed;
}

function defaultChromePath(): string {
  const candidates =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        ]
      : ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium'];
  return candidates.find(existsSync) ?? '';
}
