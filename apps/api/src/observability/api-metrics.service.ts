import { Injectable } from '@nestjs/common';
import type { RequestHandler } from 'express';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';
import { RealtimeStateService } from '../realtime/realtime-state.service';
import { httpMetricLabels } from './http-metric-labels';

type RealtimeCounterKey =
  | 'acceptedConnections'
  | 'dropped'
  | 'overdueSessionsDisconnected'
  | 'published'
  | 'rejectedAuthentication'
  | 'rejectedConnectionLimit'
  | 'rejectedLeaseUnavailable'
  | 'revalidationDurationMs'
  | 'revalidationsFailed'
  | 'revalidationsSucceeded';

const COUNTER_KEYS: readonly RealtimeCounterKey[] = [
  'acceptedConnections',
  'dropped',
  'overdueSessionsDisconnected',
  'published',
  'rejectedAuthentication',
  'rejectedConnectionLimit',
  'rejectedLeaseUnavailable',
  'revalidationDurationMs',
  'revalidationsFailed',
  'revalidationsSucceeded',
];

@Injectable()
export class ApiMetricsService {
  private readonly registry = new Registry();
  private readonly previous = Object.fromEntries(COUNTER_KEYS.map((key) => [key, 0])) as Record<
    RealtimeCounterKey,
    number
  >;
  private readonly httpRequests = new Counter({
    name: 'plg_api_http_requests_total',
    help: 'Completed API requests grouped by bounded route labels.',
    labelNames: ['method', 'route', 'status'] as const,
    registers: [this.registry],
  });
  private readonly httpDuration = new Histogram({
    name: 'plg_api_http_request_duration_seconds',
    help: 'API request duration grouped by bounded route labels.',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });
  private readonly realtimeConnections = new Gauge({
    name: 'plg_api_realtime_connections',
    help: 'Active realtime connections in this API process.',
    registers: [this.registry],
  });
  private readonly realtimeSubscriberReady = new Gauge({
    name: 'plg_api_realtime_subscriber_ready',
    help: 'Whether the realtime Redis subscriber is ready in this process.',
    registers: [this.registry],
  });
  private readonly realtimeRevalidationsInFlight = new Gauge({
    name: 'plg_api_realtime_revalidations_in_flight',
    help: 'Realtime session revalidations currently in flight.',
    registers: [this.registry],
  });
  private readonly realtimeMaximumLag = new Gauge({
    name: 'plg_api_realtime_revalidation_maximum_lag_seconds',
    help: 'Maximum observed realtime session revalidation lag.',
    registers: [this.registry],
  });
  private readonly realtimeConnectionsAccepted = this.counter(
    'plg_api_realtime_connections_accepted_total',
    'Realtime connections accepted in this process.',
  );
  private readonly realtimeConnectionsRejected = new Counter({
    name: 'plg_api_realtime_connections_rejected_total',
    help: 'Realtime connections rejected in this process.',
    labelNames: ['reason'] as const,
    registers: [this.registry],
  });
  private readonly realtimePublications = new Counter({
    name: 'plg_api_realtime_publications_total',
    help: 'Realtime publications handled in this process.',
    labelNames: ['outcome'] as const,
    registers: [this.registry],
  });
  private readonly realtimeRevalidations = new Counter({
    name: 'plg_api_realtime_revalidations_total',
    help: 'Realtime session revalidations completed in this process.',
    labelNames: ['result'] as const,
    registers: [this.registry],
  });
  private readonly realtimeRevalidationDuration = this.counter(
    'plg_api_realtime_revalidation_duration_seconds_total',
    'Cumulative realtime session revalidation duration.',
  );
  private readonly realtimeOverdueDisconnected = this.counter(
    'plg_api_realtime_overdue_sessions_disconnected_total',
    'Realtime sessions disconnected after exceeding the revalidation deadline.',
  );

  constructor(private readonly realtime: RealtimeStateService) {
    collectDefaultMetrics({ prefix: 'plg_api_', register: this.registry });
  }

  middleware(): RequestHandler {
    return (request, response, next) => {
      const start = process.hrtime.bigint();
      response.once('finish', () => {
        const durationSeconds = Number(process.hrtime.bigint() - start) / 1_000_000_000;
        const labels = httpMetricLabels(request, response);
        this.httpRequests.inc(labels);
        this.httpDuration.observe(labels, durationSeconds);
      });
      next();
    };
  }

  async render(): Promise<string> {
    this.synchronizeRealtime();
    return this.registry.metrics();
  }

  contentType(): string {
    return this.registry.contentType;
  }

  private counter(name: string, help: string): Counter {
    return new Counter({ name, help, registers: [this.registry] });
  }

  private synchronizeRealtime(): void {
    const snapshot = this.realtime.snapshot();
    this.realtimeConnections.set(snapshot.activeConnections);
    this.realtimeSubscriberReady.set(snapshot.subscriberReady ? 1 : 0);
    this.realtimeRevalidationsInFlight.set(snapshot.revalidationsInFlight);
    this.realtimeMaximumLag.set(snapshot.maximumRevalidationLagMs / 1_000);
    this.increment('acceptedConnections', snapshot.acceptedConnections, (delta) =>
      this.realtimeConnectionsAccepted.inc(delta),
    );
    this.increment('rejectedAuthentication', snapshot.rejectedAuthentication, (delta) =>
      this.realtimeConnectionsRejected.labels('authentication').inc(delta),
    );
    this.increment('rejectedConnectionLimit', snapshot.rejectedConnectionLimit, (delta) =>
      this.realtimeConnectionsRejected.labels('limit').inc(delta),
    );
    this.increment('rejectedLeaseUnavailable', snapshot.rejectedLeaseUnavailable, (delta) =>
      this.realtimeConnectionsRejected.labels('lease_unavailable').inc(delta),
    );
    this.increment('published', snapshot.published, (delta) =>
      this.realtimePublications.labels('published').inc(delta),
    );
    this.increment('dropped', snapshot.dropped, (delta) =>
      this.realtimePublications.labels('dropped').inc(delta),
    );
    this.increment('revalidationsSucceeded', snapshot.revalidationsSucceeded, (delta) =>
      this.realtimeRevalidations.labels('success').inc(delta),
    );
    this.increment('revalidationsFailed', snapshot.revalidationsFailed, (delta) =>
      this.realtimeRevalidations.labels('failure').inc(delta),
    );
    this.increment('revalidationDurationMs', snapshot.revalidationDurationMs, (delta) =>
      this.realtimeRevalidationDuration.inc(delta / 1_000),
    );
    this.increment('overdueSessionsDisconnected', snapshot.overdueSessionsDisconnected, (delta) =>
      this.realtimeOverdueDisconnected.inc(delta),
    );
  }

  private increment(
    key: RealtimeCounterKey,
    current: number,
    apply: (delta: number) => void,
  ): void {
    const delta = Math.max(0, current - this.previous[key]);
    if (delta) apply(delta);
    this.previous[key] = current;
  }
}
