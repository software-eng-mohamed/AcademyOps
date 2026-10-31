import { Injectable } from '@nestjs/common';

@Injectable()
export class RealtimeStateService {
  private subscriberReady = false;
  private activeConnections = 0;
  private published = 0;
  private dropped = 0;
  private acceptedConnections = 0;
  private rejectedAuthentication = 0;
  private rejectedConnectionLimit = 0;
  private rejectedLeaseUnavailable = 0;
  private revalidationsInFlight = 0;
  private revalidationsSucceeded = 0;
  private revalidationsFailed = 0;
  private overdueSessionsDisconnected = 0;
  private revalidationDurationMs = 0;
  private maximumRevalidationLagMs = 0;

  setSubscriberReady(ready: boolean): void {
    this.subscriberReady = ready;
  }

  connectionOpened(): void {
    this.activeConnections += 1;
    this.acceptedConnections += 1;
  }

  connectionClosed(): void {
    this.activeConnections = Math.max(0, this.activeConnections - 1);
  }

  publicationSent(): void {
    this.published += 1;
  }

  publicationDropped(): void {
    this.dropped += 1;
  }

  connectionRejected(reason: 'authentication' | 'limit' | 'lease-unavailable'): void {
    if (reason === 'limit') this.rejectedConnectionLimit += 1;
    else if (reason === 'lease-unavailable') this.rejectedLeaseUnavailable += 1;
    else this.rejectedAuthentication += 1;
  }

  revalidationStarted(lagMs: number): void {
    this.revalidationsInFlight += 1;
    this.maximumRevalidationLagMs = Math.max(this.maximumRevalidationLagMs, lagMs);
  }

  revalidationFinished(durationMs: number, succeeded: boolean): void {
    this.revalidationsInFlight = Math.max(0, this.revalidationsInFlight - 1);
    this.revalidationDurationMs += durationMs;
    if (succeeded) this.revalidationsSucceeded += 1;
    else this.revalidationsFailed += 1;
  }

  overdueSessionDisconnected(): void {
    this.overdueSessionsDisconnected += 1;
  }

  snapshot() {
    return {
      subscriberReady: this.subscriberReady,
      activeConnections: this.activeConnections,
      acceptedConnections: this.acceptedConnections,
      rejectedAuthentication: this.rejectedAuthentication,
      rejectedConnectionLimit: this.rejectedConnectionLimit,
      rejectedLeaseUnavailable: this.rejectedLeaseUnavailable,
      published: this.published,
      dropped: this.dropped,
      revalidationsInFlight: this.revalidationsInFlight,
      revalidationsSucceeded: this.revalidationsSucceeded,
      revalidationsFailed: this.revalidationsFailed,
      overdueSessionsDisconnected: this.overdueSessionsDisconnected,
      revalidationDurationMs: this.revalidationDurationMs,
      maximumRevalidationLagMs: this.maximumRevalidationLagMs,
    };
  }
}
