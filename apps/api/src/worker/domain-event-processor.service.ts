import { Injectable, Logger } from '@nestjs/common';
import { ReportExportWorkerService } from '../reporting/report-export-worker.service';
import { parseInternalEnvelope } from '../realtime/realtime.contracts';
import { RealtimePublisherService } from '../realtime/realtime-publisher.service';
import { SessionNotificationService } from './notifications/session-notification.service';
import { OtpChannelNotificationService } from './notifications/otp-channel-notification.service';
import { SecurityDeliveryService } from './security/security-delivery.service';

@Injectable()
export class DomainEventProcessorService {
  private readonly logger = new Logger(DomainEventProcessorService.name);

  constructor(
    private readonly reportExports: ReportExportWorkerService,
    private readonly realtime: RealtimePublisherService,
    private readonly sessionNotifications: SessionNotificationService,
    private readonly otpChannelNotifications: OtpChannelNotificationService,
    private readonly securityDeliveries: SecurityDeliveryService,
  ) {}

  async process(jobName: string, data: unknown, jobId?: string): Promise<void> {
    const envelope = parseInternalEnvelope(data);
    const payload = envelope?.payload ?? data;
    const notificationBatch = envelope ? await this.sessionNotifications.persist(envelope) : null;
    const otpChannelBatch = envelope ? await this.otpChannelNotifications.persist(envelope) : null;
    const securityEvent = envelope ? this.securityDeliveries.supports(envelope.type) : false;
    if (jobName === 'report.export.requested') {
      const exportJobId = this.exportJobId(payload);
      if (!exportJobId) throw new Error('Report export payload invalid');
      await this.reportExports.process(exportJobId);
      this.logger.log(`Generated report export ${exportJobId} (${jobId ?? 'no-id'})`);
    } else {
      this.logger.log(`Handled ${jobName} (${jobId ?? 'no-id'})`);
    }
    if (envelope && !securityEvent) {
      await this.realtime.publish(envelope, notificationBatch?.studentPersonIds);
    }
    if (notificationBatch) await this.sessionNotifications.deliverEmails(notificationBatch);
    if (otpChannelBatch) await this.otpChannelNotifications.deliverEmails(otpChannelBatch);
    if (envelope && securityEvent) await this.securityDeliveries.deliver(envelope);
  }

  markReportFailed(exportJobId: string): Promise<void> {
    return this.reportExports.markFailed(exportJobId);
  }

  private exportJobId(data: unknown): string | null {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const value = (data as { exportJobId?: unknown }).exportJobId;
    return typeof value === 'string' ? value : null;
  }
}
