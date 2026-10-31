import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WorkerMetricsService } from './worker-metrics.service';

export const WORKER_METRICS_PATH = '/metrics';

@Injectable()
export class WorkerMetricsHttpService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerMetricsHttpService.name);
  private server: Server | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly metrics: WorkerMetricsService,
  ) {}

  async onModuleInit(): Promise<void> {
    const token = this.config.get<string>('METRICS_TOKEN');
    if (!token) {
      this.logger.warn('Worker metrics endpoint disabled because METRICS_TOKEN is not configured');
      return;
    }
    const port = this.config.get<number>('WORKER_METRICS_PORT') ?? 9_464;
    this.server = createServer((request, response) => void this.handle(request, response, token));
    this.server.headersTimeout = 3_000;
    this.server.requestTimeout = 3_000;
    this.server.keepAliveTimeout = 2_000;
    this.server.maxHeadersCount = 20;
    await listen(this.server, port);
    this.logger.log(`Worker metrics listening on internal port ${port}`);
  }

  async onModuleDestroy(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    if (!server) return;
    server.closeAllConnections();
    await close(server);
  }

  private async handle(
    request: IncomingMessage,
    response: ServerResponse,
    token: string,
  ): Promise<void> {
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (
      request.method !== 'GET' ||
      request.url !== WORKER_METRICS_PATH ||
      !safeWorkerBearer(request.headers.authorization, token)
    ) {
      response.statusCode = 404;
      response.end('Not Found');
      return;
    }
    try {
      const body = await this.metrics.render();
      response.statusCode = 200;
      response.setHeader('Content-Type', this.metrics.contentType());
      response.end(body);
    } catch {
      response.statusCode = 503;
      response.end('Metrics unavailable');
    }
  }
}

export function safeWorkerBearer(
  authorization: string | undefined,
  expectedToken: string,
): boolean {
  if (!authorization?.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(expectedToken);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, 2_000);
    timeout.unref();
    server.close(() => {
      clearTimeout(timeout);
      resolve();
    });
  });
}
