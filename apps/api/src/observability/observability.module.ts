import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { ApiMetricsService } from './api-metrics.service';
import { MetricsController } from './metrics.controller';

@Module({
  imports: [RealtimeModule],
  controllers: [MetricsController],
  providers: [ApiMetricsService],
  exports: [ApiMetricsService],
})
export class ObservabilityModule {}
