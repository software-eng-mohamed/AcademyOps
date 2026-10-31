import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { ConnectorConfig } from './connector-config';
import type { SendRequest } from './connector-types';
import type { SessionManager } from './session-manager';

type SendManager = Pick<SessionManager, 'healthy' | 'send'>;

export class ConnectorHttpServer {
  private readonly server: Server;

  constructor(
    private readonly config: ConnectorConfig,
    private readonly manager: SendManager,
  ) {
    this.server = createServer((request, response) => void this.route(request, response));
    this.server.requestTimeout = 20_000;
    this.server.headersTimeout = 5_000;
    this.server.keepAliveTimeout = 5_000;
    this.server.maxHeadersCount = 30;
  }

  listen(): Promise<void> {
    return new Promise((resolveListen, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.config.port, '0.0.0.0', () => resolveListen());
    });
  }

  close(): Promise<void> {
    return new Promise((resolveClose) => this.server.close(() => resolveClose()));
  }

  private async route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    response.setHeader('cache-control', 'no-store');
    response.setHeader('x-content-type-options', 'nosniff');
    if (request.method === 'GET' && request.url === '/health/live')
      return this.reply(response, 200);
    if (request.method === 'GET' && request.url === '/health/ready') {
      return this.reply(response, this.manager.healthy() ? 200 : 503);
    }
    if (request.method !== 'POST' || request.url !== '/internal/send') {
      return this.reply(response, 404);
    }
    if (!safeBearer(request.headers.authorization, this.config.token)) {
      return this.reply(response, 404);
    }
    try {
      const input = parseSendRequest(await readBody(request));
      const status = await this.manager.send(input);
      this.reply(response, 200, { status });
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'OTP_RECIPIENT_NOT_REGISTERED') return this.reply(response, 422);
      if (code === 'OTP_CHANNEL_NOT_READY') return this.reply(response, 503);
      if (code === 'BODY_INVALID' || code === 'BODY_TOO_LARGE') return this.reply(response, 400);
      this.reply(response, 500);
    }
  }

  private reply(response: ServerResponse, status: number, body?: object): void {
    response.statusCode = status;
    if (!body) {
      response.end();
      return;
    }
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(body));
  }
}

async function readBody(request: IncomingMessage): Promise<string> {
  let body = '';
  for await (const chunk of request) {
    body += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    if (Buffer.byteLength(body) > 4_096) throw new Error('BODY_TOO_LARGE');
  }
  return body;
}

export function parseSendRequest(body: string): SendRequest {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    throw new Error('BODY_INVALID');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('BODY_INVALID');
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (key) => !['organizationId', 'to', 'body', 'idempotencyKey'].includes(key),
    )
  ) {
    throw new Error('BODY_INVALID');
  }
  if (
    typeof input.organizationId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.organizationId,
    ) ||
    typeof input.to !== 'string' ||
    !/^\+[1-9]\d{7,14}$/.test(input.to) ||
    typeof input.body !== 'string' ||
    input.body.length < 1 ||
    input.body.length > 320 ||
    typeof input.idempotencyKey !== 'string' ||
    !/^[0-9a-z-]{8,100}$/i.test(input.idempotencyKey)
  ) {
    throw new Error('BODY_INVALID');
  }
  return input as SendRequest;
}

export function safeBearer(value: string | undefined, expectedToken: string): boolean {
  if (!value?.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(value.slice(7));
  const expected = Buffer.from(expectedToken);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
