import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Registry, collectDefaultMetrics } from 'prom-client';
import { PrismaService } from '../../platform/database/prisma.service';
import { OutboxDispatcherService, type DomainQueueSnapshot } from '../outbox-dispatcher.service';
import {
  WorkerObservabilityStateService,
  type WorkerObservabilitySnapshot,
} from './worker-observability-state.service';

const QUEUE_STATES = [
  'active',
  'completed',
  'delayed',
  'failed',
  'paused',
  'prioritized',
  'waiting',
  'waiting-children',
] as const;
export const WORKER_METRICS_REFRESH_TIMEOUT_MS = 1_250;

type OutboxSnapshotRow = {
  oldestAvailableAt: Date | null;
  pendingCount: bigint | number;
};

@Injectable()
export class WorkerMetricsService {
  private readonly registry = new Registry();
  private refreshInFlight: Promise<void> | undefined;
  private previous: WorkerObservabilitySnapshot = {
    completedJobs: 0,
    dispatchClaimFailures: 0,
    dispatchPublishFailures: 0,
    failedJobs: 0,
    stalledJobs: 0,
  };
  private readonly sourceUp = new Gauge({
    name: 'plg_worker_observability_source_up',
    help: 'Whether a worker metrics source completed its latest refresh.',
    labelNames: ['source'] as const,
    registers: [this.registry],
  });
  private readonly queueJobs = new Gauge({
    name: 'plg_worker_bullmq_jobs',
    help: 'Domain event jobs by bounded BullMQ state.',
    labelNames: ['state'] as const,
    registers: [this.registry],
  });
  private readonly oldestWaitingAge = this.gauge(
    'plg_worker_bullmq_oldest_waiting_job_age_seconds',
    'Age of the oldest waiting or prioritized domain event job.',
  );
  private readonly oldestDelayedAge = this.gauge(
    'plg_worker_bullmq_oldest_delayed_job_age_seconds',
    'Age of the oldest delayed domain event job since creation.',
  );
  private readonly outboxPending = this.gauge(
    'plg_worker_outbox_pending_events',
    'Unprocessed outbox events below the maximum attempt threshold.',
  );
  private readonly oldestAvailableOutboxAge = this.gauge(
    'plg_worker_outbox_oldest_available_event_age_seconds',
    'Age past availability of the oldest currently dispatchable outbox event.',
  );
  private readonly processedJobs = new Counter({
    name: 'plg_worker_jobs_total',
    help: 'Worker job lifecycle events observed in this process.',
    labelNames: ['result'] as const,
    registers: [this.registry],
  });
  private readonly dispatchFailures = new Counter({
    name: 'plg_worker_outbox_dispatch_failures_total',
    help: 'Outbox dispatcher failures grouped by bounded stage.',
    labelNames: ['stage'] as const,
    registers: [this.registry],
  });
  private readonly refreshTimeouts = new Counter({
    name: 'plg_worker_observability_refresh_timeouts_total',
    help: 'Worker metrics refreshes that exceeded the scrape-safe deadline.',
    registers: [this.registry],
  });

  constructor(
    private readonly dispatcher: OutboxDispatcherService,
    private readonly prisma: PrismaService,
    private readonly state: WorkerObservabilityStateService,
  ) {
    collectDefaultMetrics({ prefix: 'plg_worker_', register: this.registry });
  }

  contentType(): string {
    return this.registry.contentType;
  }

  async render(): Promise<string> {
    this.synchronizeRuntimeCounters();
    const refresh = this.refreshInFlight ?? this.refreshSources();
    this.refreshInFlight = refresh;
    const completed = await completesWithin(refresh, WORKER_METRICS_REFRESH_TIMEOUT_MS);
    if (!completed) {
      this.sourceUp.labels('bullmq').set(0);
      this.sourceUp.labels('outbox').set(0);
      this.refreshTimeouts.inc();
    }
    return this.registry.metrics();
  }

  private async refreshSources(): Promise<void> {
    try {
      await Promise.all([this.refreshQueue(), this.refreshOutbox()]);
    } finally {
      this.refreshInFlight = undefined;
    }
  }

  private async refreshQueue(): Promise<void> {
    try {
      const snapshot = await this.dispatcher.queueSnapshot();
      this.applyQueueSnapshot(snapshot);
      this.sourceUp.labels('bullmq').set(1);
    } catch {
      this.sourceUp.labels('bullmq').set(0);
    }
  }

  private applyQueueSnapshot(snapshot: DomainQueueSnapshot): void {
    for (const state of QUEUE_STATES) this.queueJobs.labels(state).set(snapshot.counts[state] ?? 0);
    this.oldestWaitingAge.set(snapshot.oldestWaitingAgeSeconds);
    this.oldestDelayedAge.set(snapshot.oldestDelayedAgeSeconds);
  }

  private async refreshOutbox(): Promise<void> {
    try {
      const [snapshot] = await this.prisma.$queryRaw<OutboxSnapshotRow[]>`
        SELECT
          count(*) FILTER (
            WHERE processed_at IS NULL AND attempts < 20
          ) AS "pendingCount",
          min(available_at) FILTER (
            WHERE processed_at IS NULL AND attempts < 20 AND available_at <= now()
          ) AS "oldestAvailableAt"
        FROM outbox_events
      `;
      this.outboxPending.set(Number(snapshot?.pendingCount ?? 0));
      const oldest = snapshot?.oldestAvailableAt?.getTime();
      this.oldestAvailableOutboxAge.set(oldest ? Math.max(0, (Date.now() - oldest) / 1_000) : 0);
      this.sourceUp.labels('outbox').set(1);
    } catch {
      this.sourceUp.labels('outbox').set(0);
    }
  }

  private synchronizeRuntimeCounters(): void {
    const current = this.state.snapshot();
    this.increment(current.completedJobs, this.previous.completedJobs, (delta) =>
      this.processedJobs.labels('completed').inc(delta),
    );
    this.increment(current.failedJobs, this.previous.failedJobs, (delta) =>
      this.processedJobs.labels('failed').inc(delta),
    );
    this.increment(current.stalledJobs, this.previous.stalledJobs, (delta) =>
      this.processedJobs.labels('stalled').inc(delta),
    );
    this.increment(current.dispatchClaimFailures, this.previous.dispatchClaimFailures, (delta) =>
      this.dispatchFailures.labels('claim').inc(delta),
    );
    this.increment(
      current.dispatchPublishFailures,
      this.previous.dispatchPublishFailures,
      (delta) => this.dispatchFailures.labels('publish').inc(delta),
    );
    this.previous = current;
  }

  private increment(current: number, previous: number, apply: (delta: number) => void): void {
    const delta = Math.max(0, current - previous);
    if (delta) apply(delta);
  }

  private gauge(name: string, help: string): Gauge {
    return new Gauge({ name, help, registers: [this.registry] });
  }
}

async function completesWithin(work: Promise<void>, timeoutMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
    timer.unref();
  });
  const completed = work.then(() => true);
  const result = await Promise.race([completed, timeout]);
  if (timer) clearTimeout(timer);
  return result;
}
