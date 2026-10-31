import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { parseInternalEnvelope } from '../realtime/realtime.contracts';
import { developmentErrorStack, safeErrorSummary } from '../platform/logging/safe-error';
import { DomainEventProcessorService } from './domain-event-processor.service';
import { WorkerObservabilityStateService } from './observability/worker-observability-state.service';

@Injectable()
export class DomainEventWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DomainEventWorkerService.name);
  private readonly connection: IORedis;
  private worker?: Worker;

  constructor(
    config: ConfigService,
    private readonly processor: DomainEventProcessorService,
    private readonly observability: WorkerObservabilityStateService,
  ) {
    this.connection = new IORedis(config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: null,
    });
  }

  onModuleInit(): void {
    this.worker = new Worker(
      'plg-domain-events',
      async (job) => {
        await this.processor.process(job.name, job.data as unknown, job.id);
      },
      { connection: this.connection, concurrency: 5 },
    );
    this.worker.on('completed', () => this.observability.jobCompleted());
    this.worker.on('failed', (job, error) => {
      this.observability.jobFailed();
      this.logger.error(
        `Job ${job?.id ?? 'unknown'} failed (${safeErrorSummary(error)})`,
        developmentErrorStack(error),
      );
      const attempts = typeof job?.opts.attempts === 'number' ? job.opts.attempts : 1;
      const envelope = parseInternalEnvelope(job?.data as unknown);
      const exportJobId = this.exportJobId(envelope?.payload ?? (job?.data as unknown));
      if (job?.name === 'report.export.requested' && job.attemptsMade >= attempts && exportJobId) {
        void this.processor.markReportFailed(exportJobId);
      }
    });
    this.worker.on('stalled', () => this.observability.jobStalled());
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.connection.quit();
  }

  private exportJobId(data: unknown): string | null {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const value = (data as { exportJobId?: unknown }).exportJobId;
    return typeof value === 'string' ? value : null;
  }
}
