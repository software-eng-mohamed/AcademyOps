import type { RequestOptions } from './base.js';
import { buildQuery } from './base.js';
import { validatePaymentMutationResult } from './finance-validators.js';
import { PlgOwnerClient } from './owner-client.js';
import type * as S from './owner-session-models.js';
import {
  validateApprovalDecision,
  validateOwnerCohortDetail,
  validateOwnerSessionsPage,
  validatePricingApproval,
  validateSessionMutation,
} from './owner-session-validators.js';

type SessionQuery = {
  cursor?: string | undefined;
  cohortId?: string | undefined;
  branchId?: string | undefined;
  roomId?: string | undefined;
  trainerId?: string | undefined;
  status?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  limit?: number | undefined;
};

export class PlgOwnerSessionClient extends PlgOwnerClient {
  async listOwnerSessions(query: SessionQuery = {}, options?: RequestOptions) {
    return validateOwnerSessionsPage(
      await this.request('GET', `/sessions${buildQuery(query)}`, undefined, undefined, options),
    );
  }
  getOwnerSession(id: string, options?: RequestOptions): Promise<S.OwnerSession> {
    return this.request(
      'GET',
      `/sessions/${encodeURIComponent(id)}`,
      undefined,
      undefined,
      options,
    );
  }
  async getOwnerCohort(id: string) {
    return validateOwnerCohortDetail(
      await this.request('GET', `/cohorts/${encodeURIComponent(id)}`),
    );
  }
  async createOwnerSession(input: S.CreateOwnerSessionInput, key: string) {
    return validateSessionMutation(
      await this.request('POST', '/sessions', input, { 'idempotency-key': key }),
    );
  }
  async rescheduleOwnerSession(
    id: string,
    input: S.RescheduleOwnerSessionInput,
    version: number,
    key: string,
  ) {
    return validateSessionMutation(
      await this.request('POST', `/sessions/${encodeURIComponent(id)}/reschedule`, input, {
        'If-Match': String(version),
        'idempotency-key': key,
      }),
    );
  }
  async cancelOwnerSession(id: string, reason: string, version: number, key: string) {
    return validateSessionMutation(
      await this.request(
        'POST',
        `/sessions/${encodeURIComponent(id)}/cancel`,
        { reason },
        { 'If-Match': String(version), 'idempotency-key': key },
      ),
    );
  }
  async completeOwnerSession(id: string, note: string | undefined, version: number, key: string) {
    return validateSessionMutation(
      await this.request(
        'POST',
        `/sessions/${encodeURIComponent(id)}/complete`,
        note ? { note } : {},
        { 'If-Match': String(version), 'idempotency-key': key },
      ),
    );
  }
  async postPendingPayment(id: string, version: number, key: string) {
    return validatePaymentMutationResult(
      await this.request('POST', `/payments/${encodeURIComponent(id)}/post`, undefined, {
        'If-Match': String(version),
        'idempotency-key': key,
      }),
    );
  }
  async rejectPendingPayment(id: string, reason: string, version: number, key: string) {
    return validatePaymentMutationResult(
      await this.request(
        'POST',
        `/payments/${encodeURIComponent(id)}/reject`,
        { reason },
        { 'If-Match': String(version), 'idempotency-key': key },
      ),
    );
  }
  async getPricingApproval(id: string) {
    return validatePricingApproval(
      await this.request('GET', `/pricing-agreements/${encodeURIComponent(id)}`),
    );
  }
  async decidePricingApproval(
    id: string,
    decision: 'approve' | 'reject',
    reason: string,
    version: number,
    key: string,
  ) {
    return validatePricingApproval(
      await this.request(
        'POST',
        `/pricing-agreements/${encodeURIComponent(id)}/${decision}`,
        { reason },
        { 'If-Match': String(version), 'idempotency-key': key },
      ),
    );
  }
  async decideEnrollmentCancellation(
    id: string,
    decision: 'approve' | 'reject',
    reason: string,
    key: string,
  ) {
    return validateApprovalDecision(
      await this.request(
        'POST',
        `/enrollment-cancellation-requests/${encodeURIComponent(id)}/${decision}`,
        { reason },
        { 'idempotency-key': key },
      ),
    );
  }
  async decideModuleRetake(
    id: string,
    decision: 'approve' | 'reject',
    reason: string,
    version: number,
  ) {
    return validateApprovalDecision(
      await this.request(
        'POST',
        `/module-retakes/${encodeURIComponent(id)}/${decision}`,
        { reason },
        { 'If-Match': String(version) },
      ),
    );
  }
  async approveRefundRequest(id: string, key: string) {
    return validateApprovalDecision(
      await this.request('POST', `/refund-requests/${encodeURIComponent(id)}/approve`, undefined, {
        'idempotency-key': key,
      }),
    );
  }
  async approvePaymentReversal(id: string, key: string) {
    return validatePaymentMutationResult(
      await this.request(
        'POST',
        `/payment-reversal-requests/${encodeURIComponent(id)}/approve`,
        undefined,
        { 'idempotency-key': key },
      ),
    );
  }
}
