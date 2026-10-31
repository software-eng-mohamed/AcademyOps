import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OutboxEvent } from '@prisma/client';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaService } from '../platform/database/prisma.service';
import { developmentErrorStack, safeErrorSummary } from '../platform/logging/safe-error';
import { internalEnvelopeFrom } from '../realtime/realtime.contracts';
import { WorkerObservabilityStateService } from './observability/worker-observability-state.service';

const transientSecurityEvents = new Set([
  'security.password_reset_requested',
  'security.phone_otp_requested',
]);

export function outboxJobRetention(type: string): {
  removeOnComplete: boolean | number;
  removeOnFail: boolean | number;
} {
  return transientSecurityEvents.has(type)
    ? { removeOnComplete: true, removeOnFail: true }
    : { removeOnComplete: 1_000, removeOnFail: 5_000 };
}

export type DomainQueueSnapshot = {
  counts: Record<string, number>;
  oldestDelayedAgeSeconds: number;
  oldestWaitingAgeSeconds: number;
};

@Injectable()
export class OutboxDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private readonly connection: IORedis;
  private readonly queue: Queue;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
    private readonly observability: WorkerObservabilityStateService,
  ) {
    this.connection = new IORedis(config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue('plg-domain-events', { connection: this.connection });
  }

  onModuleInit(): void {
    this.timer = setInterval(() => void this.dispatch(), 1_000);
    this.timer.unref();
    void this.dispatch();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.queue.close();
    await this.connection.quit();
  }

  async dispatch(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const claimed = await this.prisma.$transaction(async (transaction) => {
        const events = await transaction.$queryRaw<OutboxEvent[]>`
          SELECT
            id,
            organization_id AS "organizationId",
            aggregate_type AS "aggregateType",
            aggregate_id AS "aggregateId",
            type,
            payload,
            occurred_at AS "occurredAt",
            available_at AS "availableAt",
            attempts,
            processed_at AS "processedAt",
            last_error AS "lastError",
            created_at AS "createdAt"
          FROM outbox_events
          WHERE processed_at IS NULL AND available_at <= now() AND attempts < 20
          ORDER BY created_at
          FOR UPDATE SKIP LOCKED
          LIMIT 50
        `;
        if (events.length) {
          await transaction.outboxEvent.updateMany({
            where: { id: { in: events.map((event) => event.id) } },
            data: { attempts: { increment: 1 }, availableAt: new Date(Date.now() + 5 * 60 * 1000) },
          });
        }
        return events;
      });
      for (const event of claimed) await this.publish(event);
    } catch (error) {
      this.observability.dispatchFailed('claim');
      this.logger.error('Outbox dispatch failed', developmentErrorStack(error));
    } finally {
      this.running = false;
    }
  }

  async queueSnapshot(now = Date.now()): Promise<DomainQueueSnapshot> {
    const [counts, waiting, prioritized, delayed] = await Promise.all([
      this.queue.getJobCounts(
        'waiting',
        'active',
        'delayed',
        'failed',
        'completed',
        'prioritized',
        'waiting-children',
        'paused',
      ),
      this.queue.getJobs('waiting', 0, 0, true),
      this.queue.getJobs('prioritized', 0, 0, true),
      this.queue.getJobs('delayed', 0, 0, true),
    ]);
    return {
      counts,
      oldestDelayedAgeSeconds: oldestJobAgeSeconds(delayed, now),
      oldestWaitingAgeSeconds: oldestJobAgeSeconds([...waiting, ...prioritized], now),
    };
  }

  private async publish(event: OutboxEvent): Promise<void> {
    try {
      const envelope = internalEnvelopeFrom(event);
      await this.queue.add(event.type, envelope, {
        jobId: event.id,
        attempts: 8,
        backoff: { type: 'exponential', delay: 2_000 },
        ...outboxJobRetention(event.type),
      });
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date(), lastError: null },
      });
    } catch (error) {
      this.observability.dispatchFailed('publish');
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          lastError: safeErrorSummary(error),
          availableAt: new Date(Date.now() + 30_000),
        },
      });
    }
  }
}

export function oldestJobAgeSeconds(jobs: Array<{ timestamp?: number }>, now: number): number {
  const timestamps = jobs
    .map((job) => job.timestamp)
    .filter((timestamp): timestamp is number => Number.isFinite(timestamp));
  if (!timestamps.length) return 0;
  return Math.max(0, (now - Math.min(...timestamps)) / 1_000);
}
