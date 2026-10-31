export type ImportBatchStatus = 'UPLOADED' | 'STAGED' | 'VALIDATED' | 'RECONCILED' | 'FINALIZED';
export type ImportIssueSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type ImportJsonValue =
  | null
  | boolean
  | number
  | string
  | ImportJsonValue[]
  | { [key: string]: ImportJsonValue };

export type ImportBatch = {
  id: string;
  organizationId: string;
  status: ImportBatchStatus;
  sourceSha256: string;
  receivedAt: string;
  receivedBy: string;
  finalizedAt: string | null;
  finalizedBy: string | null;
  reconciliation: ImportJsonValue;
  createdAt: string;
  updatedAt: string;
};

export type ImportSource = {
  id: string;
  organizationId: string;
  batchId: string;
  originalName: string;
  sha256: string;
  sizeBytes: string;
  storedPath: string | null;
  workbookMeta: ImportJsonValue;
  createdAt: string;
};

export type ImportReconciliationRecord = {
  id: string;
  organizationId: string;
  batchId: string;
  metric: string;
  dimension: ImportJsonValue;
  sourceValue: string | number | null;
  targetValue: string | number | null;
  difference: string | number | null;
  passed: boolean;
  createdAt: string;
};

export type ImportBatchDetail = Omit<ImportBatch, 'reconciliation'> & {
  sources: ImportSource[];
  dispositions: Record<string, number>;
  openIssues: number;
  reconciliation: ImportReconciliationRecord[];
};

export type ImportBatchesPage = { items: ImportBatch[]; nextCursor: string | null };

export type ImportIssue = {
  id: string;
  organizationId: string;
  importRowId: string | null;
  batchId: string;
  severity: ImportIssueSeverity;
  code: string;
  message: string;
  details: ImportJsonValue;
  status: 'OPEN' | 'RESOLVED' | 'IGNORED';
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  row: ImportIssueRow | null;
  candidates: Array<{
    id: string;
    personId: string;
    score: string;
    reasons: ImportJsonValue;
    person: { id: string; publicId: string; name: string };
  }>;
};

export type ImportIssueRow = {
  id: string;
  sheetName: string;
  rowNumber: number;
  rowHash: string;
  disposition: string;
  targetType: string | null;
  targetId: string | null;
  rawValues: ImportJsonValue;
  normalizedValues: ImportJsonValue | null;
};

export type ImportIssuesPage = { items: ImportIssue[]; nextCursor: string | null };

export type ImportMetric = {
  metric: string;
  sourceValue: number;
  targetValue: number;
  difference: number;
  passed: boolean;
};

export type ImportStageResult = {
  id: string;
  status: ImportBatchStatus;
  sha256: string;
  duplicate: boolean;
  rowCount?: number;
};

export type ImportValidationResult = {
  batchId: string;
  dispositions: Record<string, number>;
  openIssues: number;
};

export type ImportReconcileResult = {
  batchId: string;
  passed: boolean;
  metrics: ImportMetric[];
};

export type ImportIssueResolution = {
  id: string;
  rowId: string;
  decision: 'CORRECT' | 'EXCLUDE';
  disposition: 'READY' | 'QUARANTINED' | 'ARCHIVED';
  status: 'RESOLVED';
};

export type ImportPromotionResult = {
  id: string;
  status: string;
  partial?: boolean;
  promotedRows?: number;
  quarantinedRows?: number;
  openIssues?: number;
  replayed?: boolean;
};

export type ImportQuarantineArchiveResult = {
  id: string;
  status: 'VALIDATED';
  archivedRows: number;
  resolvedIssues: number;
  remainingOpenIssues: number;
};

export type ImportFinalizeResult = {
  id: string;
  status: 'FINALIZED';
  metrics?: ImportMetric[];
  replayed?: boolean;
};

export type ResolveImportIssueInput = {
  schemaVersion: 'plg-import-correction/v1';
  decision: 'CORRECT' | 'EXCLUDE';
  expectedRowHash: string;
  expectedIssueCode: string;
  expectedIssueVersion: 1;
  correction?: Record<string, unknown> | undefined;
  note: string;
};

export type ArchiveImportQuarantineInput = { note: string };

export type LegacyArchiveRecord = {
  id: string;
  batchId: string;
  category: string;
  sourceFileId: string;
  sourceFileName: string | null;
  sheetName: string;
  rowNumber: number;
  dataHash: string;
  createdAt: string;
};

export type LegacyArchivePage = { items: LegacyArchiveRecord[]; nextCursor: string | null };

export type LegacyArchiveDetail = LegacyArchiveRecord & { data: unknown };
