import './platform/patch-uuid';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AttendanceModule } from './attendance/attendance.module';
import { validateEnvironment } from './config/environment';
import { environmentFilePaths } from './config/environment-files';
import { PlatformModule } from './platform/platform.module';
import { ReportingModule } from './reporting/reporting.module';
import { MessagingWorkerModule } from './messaging/messaging-worker.module';
import { AttendanceMaintenanceService } from './worker/attendance-maintenance.service';
import { DomainEventWorkerService } from './worker/domain-event-worker.service';
import { OutboxDispatcherService } from './worker/outbox-dispatcher.service';
import { RealtimeWorkerModule } from './realtime/realtime-worker.module';
import { EMAIL_PROVIDER } from './worker/notifications/email-provider';
import { EmailDeliveryLedgerService } from './worker/notifications/email-delivery-ledger.service';
import { SmtpEmailService } from './worker/notifications/smtp-email.service';
import { SessionNotificationService } from './worker/notifications/session-notification.service';
import { SessionNotificationTargetService } from './worker/notifications/session-notification-target.service';
import { OtpChannelNotificationService } from './worker/notifications/otp-channel-notification.service';
import { OtpChannelNotificationTargetService } from './worker/notifications/otp-channel-notification-target.service';
import { DomainEventProcessorService } from './worker/domain-event-processor.service';
import { SecurityDeliveryLedgerService } from './worker/security/security-delivery-ledger.service';
import { SecurityDeliveryService } from './worker/security/security-delivery.service';
import { SecurityOutboxRetentionService } from './worker/security/security-outbox-retention.service';
import { WorkerMetricsHttpService } from './worker/observability/worker-metrics-http.service';
import { WorkerMetricsService } from './worker/observability/worker-metrics.service';
import { WorkerObservabilityStateService } from './worker/observability/worker-observability-state.service';
import { OtpChannelWatchdogService } from './worker/otp-channel-watchdog.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: environmentFilePaths(),
      validate: validateEnvironment,
    }),
    PlatformModule,
    AttendanceModule,
    ReportingModule,
    RealtimeWorkerModule,
    MessagingWorkerModule,
  ],
  providers: [
    OutboxDispatcherService,
    DomainEventWorkerService,
    WorkerObservabilityStateService,
    WorkerMetricsService,
    WorkerMetricsHttpService,
    DomainEventProcessorService,
    AttendanceMaintenanceService,
    EmailDeliveryLedgerService,
    SmtpEmailService,
    { provide: EMAIL_PROVIDER, useExisting: SmtpEmailService },
    SessionNotificationService,
    SessionNotificationTargetService,
    OtpChannelNotificationService,
    OtpChannelNotificationTargetService,
    SecurityDeliveryLedgerService,
    SecurityDeliveryService,
    SecurityOutboxRetentionService,
    OtpChannelWatchdogService,
  ],
})
export class WorkerModule {}
