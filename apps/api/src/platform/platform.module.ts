import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { AuditService } from './audit/audit.service';
import { AuditController } from './audit/audit.controller';
import { OutboxService } from './outbox/outbox.service';
import { IdempotencyService } from './idempotency/idempotency.service';
import { FileStorageService } from './files/file-storage.service';
import { FilesController } from './files/files.controller';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import {
  REDIS_READINESS_CLIENT_FACTORY,
  RedisReadinessService,
} from './health/redis-readiness.service';

@Module({
  imports: [DatabaseModule],
  controllers: [HealthController, FilesController, AuditController],
  providers: [
    AuditService,
    OutboxService,
    IdempotencyService,
    FileStorageService,
    RedisReadinessService,
    {
      provide: REDIS_READINESS_CLIENT_FACTORY,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => () =>
        new IORedis(config.getOrThrow<string>('REDIS_URL'), {
          lazyConnect: true,
          connectTimeout: 1_000,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          retryStrategy: () => null,
        }),
    },
  ],
  exports: [DatabaseModule, AuditService, OutboxService, IdempotencyService, FileStorageService],
})
export class PlatformModule {}
