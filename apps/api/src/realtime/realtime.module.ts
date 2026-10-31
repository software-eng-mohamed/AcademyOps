import { Module } from '@nestjs/common';
import { IamModule } from '../iam/iam.module';
import { RealtimeAuthService } from './realtime-auth.service';
import { RealtimeConnectionLeaseService } from './realtime-connection-lease.service';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeStateService } from './realtime-state.service';
import { RealtimeSubscriberService } from './realtime-subscriber.service';
import { RealtimeTicketController } from './realtime-ticket.controller';
import { REALTIME_TICKET_REDIS, RealtimeTicketService } from './realtime-ticket.service';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';

@Module({
  imports: [IamModule],
  controllers: [RealtimeTicketController],
  providers: [
    RealtimeAuthService,
    RealtimeConnectionLeaseService,
    RealtimeGateway,
    RealtimeStateService,
    RealtimeSubscriberService,
    RealtimeTicketService,
    {
      provide: REALTIME_TICKET_REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new IORedis(config.getOrThrow<string>('REDIS_URL'), {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
        }),
    },
  ],
  exports: [RealtimeStateService],
})
export class RealtimeModule {}
