import { Module } from '@nestjs/common';
import { PlatformModule } from '../platform/platform.module';
import { RealtimePublisherService } from './realtime-publisher.service';
import { RealtimeStateService } from './realtime-state.service';
import { RealtimeTargetResolverService } from './realtime-target-resolver.service';

@Module({
  imports: [PlatformModule],
  providers: [RealtimePublisherService, RealtimeStateService, RealtimeTargetResolverService],
  exports: [RealtimePublisherService],
})
export class RealtimeWorkerModule {}
