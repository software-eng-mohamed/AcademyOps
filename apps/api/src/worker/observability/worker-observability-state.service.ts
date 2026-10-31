import { Injectable } from '@nestjs/common';

export type WorkerObservabilitySnapshot = {
  completedJobs: number;
  dispatchClaimFailures: number;
  dispatchPublishFailures: number;
  failedJobs: number;
  stalledJobs: number;
};

@Injectable()
export class WorkerObservabilityStateService {
  private completedJobs = 0;
  private failedJobs = 0;
  private stalledJobs = 0;
  private dispatchClaimFailures = 0;
  private dispatchPublishFailures = 0;

  jobCompleted(): void {
    this.completedJobs += 1;
  }

  jobFailed(): void {
    this.failedJobs += 1;
  }

  jobStalled(): void {
    this.stalledJobs += 1;
  }

  dispatchFailed(stage: 'claim' | 'publish'): void {
    if (stage === 'claim') this.dispatchClaimFailures += 1;
    else this.dispatchPublishFailures += 1;
  }

  snapshot(): WorkerObservabilitySnapshot {
    return {
      completedJobs: this.completedJobs,
      dispatchClaimFailures: this.dispatchClaimFailures,
      dispatchPublishFailures: this.dispatchPublishFailures,
      failedJobs: this.failedJobs,
      stalledJobs: this.stalledJobs,
    };
  }
}
