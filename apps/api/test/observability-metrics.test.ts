import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { RealtimeStateService } from '../src/realtime/realtime-state.service';
import { ApiMetricsService } from '../src/observability/api-metrics.service';
import { httpMetricLabels, normalizeRouteTemplate } from '../src/observability/http-metric-labels';
import { MetricsController } from '../src/observability/metrics.controller';

describe('Prometheus application metrics', () => {
  it('uses only bounded templates and never raw request URLs as labels', () => {
    const labels = httpMetricLabels(
      {
        method: 'get',
        baseUrl: '',
        route: { path: '/api/v1/users/:id' },
        originalUrl: '/api/v1/users/550e8400-e29b-41d4-a716-446655440000?email=person@example.com',
      } as never,
      { statusCode: 201 } as never,
    );
    expect(labels).toEqual({ method: 'GET', route: '/api/v1/users/:param', status: '2xx' });
    expect(JSON.stringify(labels)).not.toMatch(/550e8400|person@example|201/);
    expect(normalizeRouteTemplate('/users/550e8400-e29b-41d4-a716-446655440000')).toBe(
      '/users/:id',
    );
    expect(normalizeRouteTemplate('/actions/privateOpaqueToken123456789')).toBe('/actions/:token');
  });

  it('renders process, HTTP, and realtime state without PII labels', async () => {
    const realtime = new RealtimeStateService();
    realtime.setSubscriberReady(true);
    realtime.connectionOpened();
    realtime.connectionRejected('authentication');
    realtime.publicationSent();
    realtime.revalidationStarted(250);
    realtime.revalidationFinished(40, true);
    const metrics = new ApiMetricsService(realtime);
    const finish = new EventEmitter();
    const response = Object.assign(finish, { statusCode: 200 });
    const next = vi.fn();
    metrics.middleware()(
      {
        method: 'GET',
        route: { path: '/api/v1/students/:studentId' },
        originalUrl: '/api/v1/students/private-person-id?email=person@example.com',
      } as never,
      response as never,
      next,
    );
    finish.emit('finish');
    const rendered = await metrics.render();
    expect(next).toHaveBeenCalledOnce();
    expect(rendered).toContain('plg_api_process_cpu_user_seconds_total');
    expect(rendered).toContain(
      'plg_api_http_requests_total{method="GET",route="/api/v1/students/:param",status="2xx"} 1',
    );
    expect(rendered).toContain('plg_api_realtime_connections 1');
    expect(rendered).toContain('plg_api_realtime_subscriber_ready 1');
    expect(rendered).toContain('reason="authentication"');
    expect(rendered).not.toMatch(/private-person-id|person@example\.com|studentId/);
  });

  it('hides the scrape endpoint and accepts only the configured bearer token', async () => {
    const token = 'metrics-bearer-token-at-least-32-bytes-long';
    const metrics = new ApiMetricsService(new RealtimeStateService());
    const config = new ConfigService({ METRICS_TOKEN: token });
    const controller = new MetricsController(metrics, config);
    const response = { type: vi.fn() };
    await expect(controller.scrape(undefined, response as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(controller.scrape('Bearer wrong', response as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(controller.scrape(`Bearer ${token}`, response as never)).resolves.toContain(
      'plg_api_realtime_connections',
    );
    expect(response.type).toHaveBeenCalledWith(expect.stringContaining('text/plain'));
  });
});
