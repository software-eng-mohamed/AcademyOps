import { buildQuery } from './base.js';
import { PlgApiError } from './errors.js';
import type {
  ArchiveImportQuarantineInput,
  LegacyArchiveDetail,
  LegacyArchivePage,
  ResolveImportIssueInput,
} from './import-models.js';
import {
  validateImportBatchDetail,
  validateImportBatchesPage,
  validateImportFinalize,
  validateImportIssueResolution,
  validateImportIssuesPage,
  validateImportPromotion,
  validateImportQuarantineArchive,
  validateImportReconcile,
  validateImportStage,
  validateImportValidation,
} from './import-validators.js';
import type { ApiError } from './models.js';
import { PlgOwnerSessionClient } from './owner-session-client.js';

type ImportBatchQuery = {
  status?: 'STAGED' | 'VALIDATED' | 'RECONCILED' | 'FINALIZED' | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
};

type ImportIssueQuery = {
  status?: 'OPEN' | 'RESOLVED' | 'IGNORED' | undefined;
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | undefined;
  code?: string | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
};

export class PlgImportClient extends PlgOwnerSessionClient {
  listLegacyArchive(
    query: {
      batchId?: string;
      category?: string;
      sheetName?: string;
      cursor?: string;
      limit?: number;
    } = {},
  ): Promise<LegacyArchivePage> {
    return this.request('GET', `/legacy-archive${buildQuery(query)}`);
  }

  getLegacyArchiveRecord(id: string): Promise<LegacyArchiveDetail> {
    return this.request('GET', `/legacy-archive/${encodeURIComponent(id)}`);
  }

  async listImportBatches(query: ImportBatchQuery = {}) {
    return validateImportBatchesPage(
      await this.request('GET', `/imports/batches${buildQuery(query)}`),
    );
  }

  async getImportBatch(id: string) {
    return validateImportBatchDetail(
      await this.request('GET', `/imports/batches/${encodeURIComponent(id)}`),
    );
  }

  async listImportIssues(id: string, query: ImportIssueQuery = {}) {
    return validateImportIssuesPage(
      await this.request(
        'GET',
        `/imports/batches/${encodeURIComponent(id)}/issues${buildQuery(query)}`,
      ),
    );
  }

  async uploadImportBatch(file: Blob, filename: string) {
    const form = new FormData();
    form.append('file', file, filename);
    const response = await fetch(`${this.options.baseUrl}/imports/batches`, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(this.options.cookie ? { Cookie: this.options.cookie } : {}),
        'x-csrf-token': this.options.getCsrfToken?.() ?? '',
        'x-correlation-id': crypto.randomUUID(),
      },
      body: form,
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({
        code: 'REQUEST_FAILED',
        messageKey: 'errors.requestFailed',
      }))) as ApiError;
      throw new PlgApiError(response.status, payload);
    }
    return validateImportStage(await response.json());
  }

  async validateImportBatch(id: string) {
    return validateImportValidation(
      await this.request('POST', `/imports/batches/${encodeURIComponent(id)}/validate`),
    );
  }

  async reconcileImportBatch(id: string) {
    return validateImportReconcile(
      await this.request('POST', `/imports/batches/${encodeURIComponent(id)}/reconcile`),
    );
  }

  async resolveImportIssue(id: string, issueId: string, input: ResolveImportIssueInput) {
    return validateImportIssueResolution(
      await this.request(
        'PATCH',
        `/imports/batches/${encodeURIComponent(id)}/issues/${encodeURIComponent(issueId)}`,
        input,
      ),
    );
  }

  async promoteImportReady(id: string, idempotencyKey: string) {
    return validateImportPromotion(
      await this.request(
        'POST',
        `/imports/batches/${encodeURIComponent(id)}/promote-ready`,
        undefined,
        { 'idempotency-key': idempotencyKey },
      ),
    );
  }

  async archiveImportQuarantine(
    id: string,
    input: ArchiveImportQuarantineInput,
    idempotencyKey: string,
  ) {
    return validateImportQuarantineArchive(
      await this.request(
        'POST',
        `/imports/batches/${encodeURIComponent(id)}/archive-quarantined`,
        input,
        { 'idempotency-key': idempotencyKey },
      ),
    );
  }

  async finalizeImportBatch(id: string, idempotencyKey: string) {
    return validateImportFinalize(
      await this.request('POST', `/imports/batches/${encodeURIComponent(id)}/finalize`, undefined, {
        'idempotency-key': idempotencyKey,
      }),
    );
  }
}
