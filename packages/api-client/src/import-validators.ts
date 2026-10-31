import { PlgApiError } from './errors.js';
import type * as I from './import-models.js';

const batchStatuses = new Set(['UPLOADED', 'STAGED', 'VALIDATED', 'RECONCILED', 'FINALIZED']);
const issueStatuses = new Set(['OPEN', 'RESOLVED', 'IGNORED']);
const issueSeverities = new Set(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);

function invalid(): never {
  throw new PlgApiError(500, { code: 'RESPONSE_INVALID', messageKey: 'errors.requestFailed' });
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === 'string';
}
function nullableText(value: unknown): value is string | null {
  return value === null || text(value);
}
function numeric(value: unknown): value is string | number {
  return (
    (typeof value === 'number' && Number.isFinite(value)) ||
    (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))
  );
}
function nullableNumeric(value: unknown): value is string | number | null {
  return value === null || numeric(value);
}
function numericRecord(value: unknown): value is Record<string, number> {
  return object(value) && Object.values(value).every((item) => typeof item === 'number');
}

function jsonValue(value: unknown): value is I.ImportJsonValue {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(jsonValue);
  return object(value) && Object.values(value).every(jsonValue);
}

function issueRow(value: unknown): value is I.ImportIssueRow {
  return (
    object(value) &&
    text(value.id) &&
    text(value.sheetName) &&
    typeof value.rowNumber === 'number' &&
    Number.isInteger(value.rowNumber) &&
    text(value.disposition) &&
    nullableText(value.targetType) &&
    nullableText(value.targetId) &&
    jsonValue(value.rawValues) &&
    jsonValue(value.normalizedValues)
  );
}

function batch(value: unknown): value is I.ImportBatch {
  return (
    object(value) &&
    text(value.id) &&
    text(value.organizationId) &&
    batchStatuses.has(String(value.status)) &&
    text(value.sourceSha256) &&
    text(value.receivedAt) &&
    text(value.receivedBy) &&
    nullableText(value.finalizedAt) &&
    nullableText(value.finalizedBy) &&
    jsonValue(value.reconciliation) &&
    text(value.createdAt) &&
    text(value.updatedAt)
  );
}

function source(value: unknown): value is I.ImportSource {
  return (
    object(value) &&
    text(value.id) &&
    text(value.organizationId) &&
    text(value.batchId) &&
    text(value.originalName) &&
    text(value.sha256) &&
    text(value.sizeBytes) &&
    nullableText(value.storedPath) &&
    jsonValue(value.workbookMeta) &&
    text(value.createdAt)
  );
}

function reconciliation(value: unknown): value is I.ImportReconciliationRecord {
  return (
    object(value) &&
    text(value.id) &&
    text(value.organizationId) &&
    text(value.batchId) &&
    text(value.metric) &&
    jsonValue(value.dimension) &&
    nullableNumeric(value.sourceValue) &&
    nullableNumeric(value.targetValue) &&
    nullableNumeric(value.difference) &&
    typeof value.passed === 'boolean' &&
    text(value.createdAt)
  );
}

function issue(value: unknown): value is I.ImportIssue {
  return (
    object(value) &&
    text(value.id) &&
    text(value.organizationId) &&
    nullableText(value.importRowId) &&
    text(value.batchId) &&
    issueSeverities.has(String(value.severity)) &&
    text(value.code) &&
    /^[A-Z][A-Z0-9_]*$/.test(value.code) &&
    text(value.message) &&
    jsonValue(value.details) &&
    issueStatuses.has(String(value.status)) &&
    nullableText(value.resolvedBy) &&
    nullableText(value.resolvedAt) &&
    text(value.createdAt) &&
    (value.row === null || issueRow(value.row))
  );
}

function metric(value: unknown): value is I.ImportMetric {
  return (
    object(value) &&
    text(value.metric) &&
    typeof value.sourceValue === 'number' &&
    typeof value.targetValue === 'number' &&
    typeof value.difference === 'number' &&
    typeof value.passed === 'boolean'
  );
}

export function validateImportBatchesPage(value: unknown): I.ImportBatchesPage {
  if (!object(value) || !Array.isArray(value.items) || !nullableText(value.nextCursor)) invalid();
  if (!value.items.every(batch)) invalid();
  return value as unknown as I.ImportBatchesPage;
}

export function validateImportBatchDetail(value: unknown): I.ImportBatchDetail {
  if (!object(value)) invalid();
  const batchView = { ...value, reconciliation: null };
  if (
    !batch(batchView) ||
    !Array.isArray(value.sources) ||
    !value.sources.every(source) ||
    !numericRecord(value.dispositions) ||
    typeof value.openIssues !== 'number' ||
    !Array.isArray(value.reconciliation) ||
    !value.reconciliation.every(reconciliation)
  )
    invalid();
  return value as unknown as I.ImportBatchDetail;
}

export function validateImportIssuesPage(value: unknown): I.ImportIssuesPage {
  if (!object(value) || !Array.isArray(value.items) || !nullableText(value.nextCursor)) invalid();
  if (!value.items.every(issue)) invalid();
  return value as unknown as I.ImportIssuesPage;
}

export function validateImportStage(value: unknown): I.ImportStageResult {
  if (
    !object(value) ||
    !text(value.id) ||
    !batchStatuses.has(String(value.status)) ||
    !text(value.sha256) ||
    typeof value.duplicate !== 'boolean' ||
    (value.rowCount !== undefined && typeof value.rowCount !== 'number')
  )
    invalid();
  return value as I.ImportStageResult;
}

export function validateImportValidation(value: unknown): I.ImportValidationResult {
  if (
    !object(value) ||
    !text(value.batchId) ||
    !numericRecord(value.dispositions) ||
    typeof value.openIssues !== 'number'
  )
    invalid();
  return value as I.ImportValidationResult;
}

export function validateImportReconcile(value: unknown): I.ImportReconcileResult {
  if (
    !object(value) ||
    !text(value.batchId) ||
    typeof value.passed !== 'boolean' ||
    !Array.isArray(value.metrics) ||
    !value.metrics.every(metric)
  )
    invalid();
  return value as unknown as I.ImportReconcileResult;
}

export function validateImportIssueResolution(value: unknown): I.ImportIssueResolution {
  if (
    !object(value) ||
    !text(value.id) ||
    !text(value.rowId) ||
    !['READY', 'ARCHIVED'].includes(String(value.disposition)) ||
    value.status !== 'RESOLVED'
  )
    invalid();
  return value as I.ImportIssueResolution;
}

export function validateImportPromotion(value: unknown): I.ImportPromotionResult {
  if (
    !object(value) ||
    !text(value.id) ||
    !['VALIDATED', 'FINALIZED'].includes(String(value.status))
  )
    invalid();
  for (const key of ['promotedRows', 'quarantinedRows', 'openIssues'] as const) {
    if (value[key] !== undefined && typeof value[key] !== 'number') invalid();
  }
  if (value.partial !== undefined && typeof value.partial !== 'boolean') invalid();
  if (value.replayed !== undefined && typeof value.replayed !== 'boolean') invalid();
  return value as I.ImportPromotionResult;
}

export function validateImportQuarantineArchive(value: unknown): I.ImportQuarantineArchiveResult {
  if (
    !object(value) ||
    !text(value.id) ||
    value.status !== 'VALIDATED' ||
    !['archivedRows', 'resolvedIssues', 'remainingOpenIssues'].every(
      (key) => typeof value[key] === 'number' && Number.isInteger(value[key]) && value[key] >= 0,
    )
  )
    invalid();
  return value as unknown as I.ImportQuarantineArchiveResult;
}

export function validateImportFinalize(value: unknown): I.ImportFinalizeResult {
  if (!object(value) || !text(value.id) || value.status !== 'FINALIZED') invalid();
  if (
    value.metrics !== undefined &&
    (!Array.isArray(value.metrics) || !value.metrics.every(metric))
  )
    invalid();
  if (value.replayed !== undefined && typeof value.replayed !== 'boolean') invalid();
  return value as I.ImportFinalizeResult;
}
