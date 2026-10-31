import type * as AM from './attendance-models.js';
import {
  validateAttendanceMutationResult,
  validateAttendanceRosterPage,
  validateAttendanceWindowState,
  validateStableQrTokenResponse,
} from './attendance-validators.js';
import { buildQuery, type RequestOptions } from './base.js';
import { PlgMessagingClient } from './messaging-client.js';
import type * as SM from './student-models.js';
import {
  validateCertificateDownloadResult,
  validateCertificateEligibility,
  validateInstallmentsPage,
} from './student-validators.js';

export type { PlgApiClientOptions, RequestOptions } from './base.js';

export class PlgApiClient extends PlgMessagingClient {
  async getEnrollmentInstallments(
    enrollmentId: string,
    query?: { cursor?: string; limit?: number },
    options?: RequestOptions,
  ): Promise<SM.InstallmentsPage> {
    return validateInstallmentsPage(
      await this.request(
        'GET',
        `/enrollments/${encodeURIComponent(enrollmentId)}/installments${buildQuery(query ?? {})}`,
        undefined,
        undefined,
        options,
      ),
    );
  }

  async getCertificateEligibility(
    enrollmentId: string,
    options?: RequestOptions,
  ): Promise<SM.CertificateEligibility> {
    return validateCertificateEligibility(
      await this.request(
        'GET',
        `/certificates/enrollments/${encodeURIComponent(enrollmentId)}/eligibility`,
        undefined,
        undefined,
        options,
      ),
    );
  }

  async downloadCertificate(
    certificateId: string,
    options?: RequestOptions,
  ): Promise<SM.CertificateDownloadResult> {
    return validateCertificateDownloadResult(
      await this.request(
        'GET',
        `/certificates/${encodeURIComponent(certificateId)}/download`,
        undefined,
        undefined,
        options,
      ),
    );
  }

  async getAttendanceRoster(
    sessionId: string,
    query: { cursor?: string; limit?: number },
  ): Promise<AM.AttendanceRosterPage> {
    return validateAttendanceRosterPage(
      await this.request(
        'GET',
        `/sessions/${encodeURIComponent(sessionId)}/attendance${buildQuery(query)}`,
      ),
    );
  }

  async openAttendanceWindow(
    sessionId: string,
    version: number,
  ): Promise<{ id: string; state: string; version: number }> {
    return validateAttendanceWindowState(
      await this.request(
        'POST',
        `/sessions/${encodeURIComponent(sessionId)}/attendance-window/open`,
        undefined,
        { 'If-Match': String(version) },
      ),
    );
  }

  async closeAttendanceWindow(
    sessionId: string,
    version: number,
    idempotencyKey: string,
  ): Promise<{
    id: string;
    state: string;
    version: number;
    rosterCount?: number;
    absentCount?: number;
  }> {
    return validateAttendanceWindowState(
      await this.request(
        'POST',
        `/sessions/${encodeURIComponent(sessionId)}/attendance-window/close`,
        undefined,
        {
          'If-Match': String(version),
          'idempotency-key': idempotencyKey,
        },
      ),
    );
  }

  async scanAttendance(
    sessionId: string,
    token: string,
    status: 'PRESENT' | 'LATE',
    idempotencyKey: string,
  ): Promise<AM.AttendanceMutationResult> {
    return validateAttendanceMutationResult(
      await this.request(
        'POST',
        `/sessions/${encodeURIComponent(sessionId)}/attendance/scan`,
        { token, status },
        { 'idempotency-key': idempotencyKey },
      ),
    );
  }

  openAttendanceChallenge(sessionId: string): Promise<AM.AttendanceQrChallenge> {
    return this.request('POST', `/sessions/${encodeURIComponent(sessionId)}/qr-challenges`);
  }

  async checkInAttendance(token: string, idempotencyKey: string) {
    return validateAttendanceMutationResult(
      await this.request(
        'POST',
        '/attendance/check-in',
        { token },
        { 'idempotency-key': idempotencyKey },
      ),
    );
  }

  listAttendanceAnomalies(
    sessionId: string,
    query: { cursor?: string; limit?: number } = {},
    options?: RequestOptions,
  ): Promise<{ items: AM.AttendanceAnomaly[]; nextCursor: string | null }> {
    return this.request(
      'GET',
      `/sessions/${encodeURIComponent(sessionId)}/attendance-anomalies${buildQuery(query)}`,
      undefined,
      undefined,
      options,
    );
  }

  listAttendancePolicies(
    query: { programVersionId?: string; cohortId?: string; activeAt?: string } = {},
    options?: RequestOptions,
  ): Promise<{ items: AM.AttendancePolicy[] }> {
    return this.request(
      'GET',
      `/attendance-policies${buildQuery(query)}`,
      undefined,
      undefined,
      options,
    );
  }

  createAttendancePolicy(
    input: AM.CreateAttendancePolicyInput,
    idempotencyKey: string,
  ): Promise<
    Pick<AM.AttendancePolicy, 'id' | 'version' | 'minimumRatio' | 'effectiveFrom' | 'effectiveTo'>
  > {
    return this.request('POST', '/attendance-policies', input, {
      'idempotency-key': idempotencyKey,
    });
  }

  async recordManualAttendance(
    sessionId: string,
    enrollmentId: string,
    status: 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED',
    reason: string,
    idempotencyKey: string,
  ): Promise<AM.AttendanceMutationResult> {
    return validateAttendanceMutationResult(
      await this.request(
        'POST',
        `/sessions/${encodeURIComponent(sessionId)}/attendance/manual`,
        { enrollmentId, status, reason },
        { 'idempotency-key': idempotencyKey },
      ),
    );
  }

  async correctAttendance(
    recordId: string,
    status: 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED',
    reason: string,
    version: number,
    idempotencyKey: string,
  ): Promise<AM.AttendanceMutationResult> {
    return validateAttendanceMutationResult(
      await this.request(
        'POST',
        `/attendance/${encodeURIComponent(recordId)}/corrections`,
        { status, reason },
        {
          'If-Match': String(version),
          'idempotency-key': idempotencyKey,
        },
      ),
    );
  }

  createAttendanceMakeup(
    missedRecordId: string,
    makeupRecordId: string,
    idempotencyKey: string,
  ): Promise<{ id: string; missedRecordId: string; makeupRecordId: string }> {
    return this.request(
      'POST',
      '/attendance/makeup-credits',
      { missedRecordId, makeupRecordId },
      { 'idempotency-key': idempotencyKey },
    );
  }

  async getSelfStableQrToken(options?: RequestOptions): Promise<AM.StableQrTokenResponse> {
    return validateStableQrTokenResponse(
      await this.request('GET', '/attendance/self-token', undefined, undefined, options),
    );
  }
}
