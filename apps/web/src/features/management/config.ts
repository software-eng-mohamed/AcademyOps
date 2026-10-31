import type { AcademyRecord } from '@/api/academy/models';

export const managementSections = [
  'sessions',
  'attendance',
  'certificates',
  'businessAccounts',
  'finance',
  'payments',
  'documents',
  'reports',
] as const;
export type ManagementSection = (typeof managementSections)[number];
export type ManagementResource =
  | 'sessions'
  | 'roster'
  | 'certificates'
  | 'businessAccounts'
  | 'aging'
  | 'payments'
  | 'invoices'
  | 'receipts'
  | 'exports';
export type ManagementRow = AcademyRecord;
export type ManagementFilters = {
  cursor?: string;
  status?: string;
  search?: string;
  from?: string;
  to?: string;
  sessionId?: string;
  cohortId?: string;
  roomId?: string;
  trainerId?: string;
  page?: number;
};
export const sectionPaths: Record<ManagementSection, string> = {
  sessions: 'sessions',
  attendance: 'attendance',
  certificates: 'certificates',
  businessAccounts: 'business-accounts',
  finance: 'finance',
  payments: 'payments',
  documents: 'documents',
  reports: 'reports',
};
export const sectionPermissions: Record<ManagementSection, readonly string[]> = {
  sessions: ['academic.catalog.read'],
  attendance: ['attendance.read', 'academic.catalog.read'],
  certificates: ['certificates.read'],
  businessAccounts: ['business_accounts.read'],
  finance: ['finance.reports.read'],
  payments: ['payments.read'],
  documents: ['invoices.read', 'receipts.read'],
  reports: ['finance.reports.export', 'exports.sensitive'],
};
export const resourceColumns: Record<ManagementResource, string[]> = {
  sessions: ['cohort.name', 'startsAt', 'room.name', 'deliveryMode', 'status'],
  roster: ['student.publicId', 'effectiveStatus', 'attendance.source', 'attendance.recordedAt'],
  certificates: ['serial', 'issuedAt', 'fulfillmentStatus', 'pdfStatus', 'validityStatus'],
  businessAccounts: ['legalName', 'registrationNo', 'taxId', 'status'],
  aging: ['dueDate', 'ageDays', 'bucket', 'outstanding'],
  payments: ['method.name', 'amount', 'receivedAt', 'receiptIssued', 'status'],
  invoices: ['totalAmount', 'settledAmount', 'paymentStatus', 'issuedAt', 'status'],
  receipts: ['amount', 'fiscalYear', 'issuedAt'],
  exports: ['createdAt', 'completedAt', 'expiresAt', 'status'],
};
export const detailColumns: Record<ManagementResource, string[]> = {
  ...resourceColumns,
  sessions: [
    'cohort.name',
    'module.name',
    'startsAt',
    'endsAt',
    'room.name',
    'deliveryMode',
    'ordinal',
    'attendanceWindowState',
  ],
  payments: [
    'method.name',
    'amount',
    'refundedAmount',
    'refundStatus',
    'receivedAt',
    'postedAt',
    'externalReference',
    'billingAccountId',
    'enrollmentId',
  ],
  invoices: [
    'subtotal',
    'taxAmount',
    'totalAmount',
    'settledAmount',
    'creditedAmount',
    'paymentStatus',
    'issuedAt',
    'billingAccountId',
  ],
  receipts: ['serialNumber', 'amount', 'issuedAt', 'fiscalYear', 'billingAccountId', 'paymentId'],
  certificates: [
    'serial',
    'student.name',
    'program.name',
    'validityStatus',
    'fulfillmentStatus',
    'pdfStatus',
    'issuedAt',
    'revokedAt',
    'revocationReason',
  ],
};
export const resourceStatuses: Partial<Record<ManagementResource, string[]>> = {
  sessions: ['DRAFT', 'SCHEDULED', 'COMPLETED', 'CANCELLED'],
  businessAccounts: ['ACTIVE', 'ARCHIVED'],
  payments: ['PENDING_VERIFICATION', 'POSTED', 'REJECTED', 'REVERSED'],
  invoices: ['DRAFT', 'ISSUED', 'CANCELLED', 'VOIDED'],
  certificates: ['ISSUED', 'REVOKED'],
};
export function resourceFor(
  section: ManagementSection,
  tab: string | null,
  sessionId?: string,
): ManagementResource {
  if (section === 'attendance') return sessionId ? 'roster' : 'sessions';
  if (section === 'finance') return 'aging';
  if (section === 'documents') return tab === 'receipts' ? 'receipts' : 'invoices';
  if (section === 'reports') return 'exports';
  return section;
}
