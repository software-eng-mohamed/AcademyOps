import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import { developmentErrorStack } from '../platform/logging/safe-error';
import { REALTIME_CHANNEL } from './realtime.contracts';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeMessageProcessor } from './realtime-message-processor';
import { RealtimeStateService } from './realtime-state.service';

@Injectable()
export class RealtimeSubscriberService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeSubscriberService.name);
  private readonly redis: IORedis;
  private readonly processor = new RealtimeMessageProcessor();

  constructor(
    config: ConfigService,
    private readonly gateway: RealtimeGateway,
    private readonly state: RealtimeStateService,
  ) {
    this.redis = new IORedis(config.getOrThrow<string>('REDIS_URL'), {
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
  }

  async onModuleInit(): Promise<void> {
    this.redis.on('ready', () => this.state.setSubscriberReady(true));
    this.redis.on('end', () => this.state.setSubscriberReady(false));
    this.redis.on('error', (error) => {
      this.state.setSubscriberReady(false);
      this.logger.error('Realtime Redis subscriber error', developmentErrorStack(error));
    });
    this.redis.on('message', (channel, raw) => {
      if (channel !== REALTIME_CHANNEL) return;
      const delivered = this.processor.process(raw, (message) => this.gateway.broadcast(message));
      if (!delivered) this.state.publicationDropped();
    });
    await this.redis.connect();
    await this.redis.subscribe(REALTIME_CHANNEL);
    this.state.setSubscriberReady(true);
  }

  async onModuleDestroy(): Promise<void> {
    this.state.setSubscriberReady(false);
    if (this.redis.status !== 'end') {
      await this.redis.unsubscribe(REALTIME_CHANNEL);
      await this.redis.quit();
    }
  }
}
