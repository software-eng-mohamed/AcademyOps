import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/platform/database/prisma.service';
import {
  oldestJobAgeSeconds,
  type OutboxDispatcherService,
} from '../src/worker/outbox-dispatcher.service';
import { WorkerMetricsHttpService } from '../src/worker/observability/worker-metrics-http.service';
import {
  WORKER_METRICS_REFRESH_TIMEOUT_MS,
  WorkerMetricsService,
} from '../src/worker/observability/worker-metrics.service';
import { WorkerObservabilityStateService } from '../src/worker/observability/worker-observability-state.service';

afterEach(() => vi.useRealTimers());

describe('worker observability', () => {
  it('computes queue age without exporting job identifiers or payloads', () => {
    expect(oldestJobAgeSeconds([{ timestamp: 8_000 }, { timestamp: 9_500 }], 10_000)).toBe(2);
    expect(oldestJobAgeSeconds([], 10_000)).toBe(0);
  });

  it('exports fixed-cardinality BullMQ, outbox, runtime, and process metrics', async () => {
    const dispatcher = {
      queueSnapshot: vi.fn().mockResolvedValue({
        counts: { active: 1, completed: 4, delayed: 2, failed: 3, waiting: 5 },
        oldestDelayedAgeSeconds: 18,
        oldestWaitingAgeSeconds: 12,
      }),
    };
    const prisma = {
      $queryRaw: vi
        .fn()
        .mockResolvedValue([{ oldestAvailableAt: new Date(Date.now() - 5_000), pendingCount: 7n }]),
    };
    const state = new WorkerObservabilityStateService();
    state.jobCompleted();
    state.jobFailed();
    state.jobStalled();
    state.dispatchFailed('claim');
    state.dispatchFailed('publish');
    const metrics = new WorkerMetricsService(
      dispatcher as unknown as OutboxDispatcherService,
      prisma as unknown as PrismaService,
      state,
    );

    const rendered = await metrics.render();
    expect(rendered).toContain('plg_worker_process_cpu_user_seconds_total');
    expect(rendered).toContain('plg_worker_bullmq_jobs{state="waiting"} 5');
    expect(rendered).toContain('plg_worker_bullmq_oldest_waiting_job_age_seconds 12');
    expect(rendered).toContain('plg_worker_outbox_pending_events 7');
    expect(rendered).toContain('plg_worker_jobs_total{result="completed"} 1');
    expect(rendered).toContain('plg_worker_jobs_total{result="failed"} 1');
    expect(rendered).toContain('plg_worker_jobs_total{result="stalled"} 1');
    expect(rendered).toContain('stage="claim"');
    expect(rendered).toContain('stage="publish"');
    expect(rendered).not.toMatch(/person@example\.com|550e8400-e29b-41d4-a716-446655440000/);
  });

  it('bounds scrape refresh time and marks sources unavailable', async () => {
    vi.useFakeTimers();
    const dispatcher = { queueSnapshot: vi.fn(() => new Promise(() => undefined)) };
    const prisma = { $queryRaw: vi.fn(() => new Promise(() => undefined)) };
    const metrics = new WorkerMetricsService(
      dispatcher as unknown as OutboxDispatcherService,
      prisma as unknown as PrismaService,
      new WorkerObservabilityStateService(),
    );
    const result = metrics.render();
    await vi.advanceTimersByTimeAsync(WORKER_METRICS_REFRESH_TIMEOUT_MS);
    const rendered = await result;
    expect(rendered).toContain('plg_worker_observability_source_up{source="bullmq"} 0');
    expect(rendered).toContain('plg_worker_observability_source_up{source="outbox"} 0');
    expect(rendered).toContain('plg_worker_observability_refresh_timeouts_total 1');
  });

  it('serves only exact authenticated GET requests on its dedicated listener', async () => {
    const port = await freePort();
    const token = 'b'.repeat(64);
    const metrics = {
      contentType: () => 'text/plain; version=0.0.4',
      render: vi.fn().mockResolvedValue('worker_metric 1\n'),
    };
    const service = new WorkerMetricsHttpService(
      new ConfigService({ METRICS_TOKEN: token, WORKER_METRICS_PORT: port }),
      metrics as unknown as WorkerMetricsService,
    );
    await service.onModuleInit();
    try {
      const base = `http://127.0.0.1:${port}`;
      expect((await fetch(`${base}/metrics`)).status).toBe(404);
      expect(
        (
          await fetch(`${base}/metrics?token=${token}`, {
            headers: { authorization: `Bearer ${token}` },
          })
        ).status,
      ).toBe(404);
      const response = await fetch(`${base}/metrics`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(await response.text()).toBe('worker_metric 1\n');
    } finally {
      await service.onModuleDestroy();
    }
  });

  it('keeps the worker port private in Compose and out of Caddy', () => {
    const compose = readFileSync(resolve('../../deploy/vps/compose.yml'), 'utf8');
    const prometheus = readFileSync(resolve('../../deploy/vps/prometheus/prometheus.yml'), 'utf8');
    const caddy = readFileSync(resolve('../../deploy/vps/Caddyfile'), 'utf8');
    const workerStart = compose.indexOf('\n  worker:\n');
    const workerEnd = compose.indexOf('\n  migrate:\n', workerStart);
    const workerBlock = compose.slice(workerStart, workerEnd);
    const workerEnvironmentStart = compose.indexOf('x-worker-environment:');
    const workerEnvironmentEnd = compose.indexOf('\nx-api-environment:', workerEnvironmentStart);
    const workerEnvironment = compose.slice(workerEnvironmentStart, workerEnvironmentEnd);
    expect(workerBlock).toContain('networks: [data, egress, monitoring]');
    expect(workerBlock).toContain('<<: *worker-environment');
    expect(workerEnvironment).toContain('ACTION_TOKEN_ENCRYPTION_KEY');
    expect(workerBlock).not.toMatch(/^\s+ports:/m);
    for (const apiOnlySecret of [
      'SESSION_PEPPER',
      'QR_HMAC_SECRET',
      'FILE_SIGNING_SECRET',
      'MFA_ENCRYPTION_KEY',
      'MFA_RECOVERY_PEPPER',
      'PASSWORD_RESET_PEPPER',
      'PHONE_OTP_PEPPER',
      'WHATSAPP_AUTH_ENCRYPTION_KEY',
    ]) {
      expect(workerBlock).not.toContain(`${apiOnlySecret}:`);
      expect(workerEnvironment).not.toContain(`${apiOnlySecret}:`);
    }
    expect(prometheus).toContain('targets: [worker:9464]');
    expect(caddy).not.toContain('9464');
  });
});

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No local test port available');
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
  return address.port;
}
