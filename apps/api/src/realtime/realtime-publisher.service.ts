import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import {
  REALTIME_CHANNEL,
  type InternalEventEnvelope,
  type RealtimeFanoutMessage,
} from './realtime.contracts';
import { realtimePolicyFor } from './realtime-policy';
import { RealtimeStateService } from './realtime-state.service';
import { RealtimeTargetResolverService } from './realtime-target-resolver.service';

@Injectable()
export class RealtimePublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly redis: IORedis;

  constructor(
    config: ConfigService,
    private readonly targets: RealtimeTargetResolverService,
    private readonly state: RealtimeStateService,
  ) {
    this.redis = new IORedis(config.getOrThrow<string>('REDIS_URL'), {
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.redis.connect();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis.status !== 'end') await this.redis.quit();
  }

  async publish(
    event: InternalEventEnvelope,
    resolvedStudentPersonIds?: string[],
  ): Promise<boolean> {
    const policy = realtimePolicyFor(event.type);
    if (!policy) {
      this.state.publicationDropped();
      return false;
    }
    const studentPersonIds = policy.topics.includes('student')
      ? (resolvedStudentPersonIds ?? (await this.targets.resolveStudentPersonIds(event)))
      : [];
    const message: RealtimeFanoutMessage = {
      v: 1,
      organizationId: event.organizationId,
      staff: policy.staff,
      studentPersonIds: [...new Set(studentPersonIds)],
      invalidation: {
        v: 1,
        eventId: event.eventId,
        topics: policy.topics,
        occurredAt: event.occurredAt,
      },
    };
    await this.redis.publish(REALTIME_CHANNEL, JSON.stringify(message));
    this.state.publicationSent();
    return true;
  }
}
