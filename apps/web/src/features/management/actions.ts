import { field, textValue } from '@/api/academy/models';
import type { ManagementResource, ManagementRow } from './config';
import { financialActionPermissions } from './financial-actions';

export const actionPermissions = {
  createSession: 'academic.sessions.manage',
  reschedule: 'academic.sessions.manage',
  cancelSession: 'academic.sessions.manage',
  completeSession: 'academic.sessions.manage',
  openWindow: 'attendance.qr.open',
  closeWindow: 'attendance.qr.open',
  recordAttendance: 'attendance.record_manual',
  correctAttendance: 'attendance.correct',
  createAccount: 'business_accounts.manage',
  editAccount: 'business_accounts.manage',
  ...financialActionPermissions,
  evaluateCertificate: 'certificates.issue',
  issueCertificate: 'certificates.issue',
  revokeCertificate: 'certificates.revoke',
  reissueCertificate: 'certificates.issue',
  printCertificate: 'certificates.collect',
  readyCertificate: 'certificates.collect',
  collectCertificate: 'certificates.collect',
  createExport: 'finance.reports.export',
} as const;

export type ManagementAction = keyof typeof actionPermissions;

export function rowActions(resource: ManagementResource, row: ManagementRow): ManagementAction[] {
  const status = row.status;
  if (resource === 'aging') return Number(row.data.outstanding) > 0 ? ['createCheckout'] : [];
  if (resource === 'sessions')
    return ['DRAFT', 'SCHEDULED'].includes(status)
      ? [
          'reschedule',
          'cancelSession',
          ...(status === 'SCHEDULED' ? ['completeSession' as const] : []),
        ]
      : [];
  if (resource === 'businessAccounts') return ['editAccount'];
  if (resource === 'payments')
    return status === 'PENDING_VERIFICATION'
      ? ['postPayment', 'rejectPayment']
      : status === 'POSTED'
        ? [
            ...(!row.data.receiptIssued && !row.data.receipt ? ['issueReceipt' as const] : []),
            'requestRefund',
            'requestReversal',
          ]
        : [];
  if (resource === 'invoices')
    return status === 'DRAFT'
      ? ['issueInvoice', 'cancelInvoice']
      : status === 'ISSUED'
        ? ['voidInvoice', 'creditNote']
        : [];
  if (resource === 'certificates' && status === 'ISSUED') {
    const fulfillment = textValue(row.data.fulfillmentStatus);
    return [
      'revokeCertificate',
      ...(row.data.pdfStatus === 'AVAILABLE' && fulfillment === 'NOT_PRINTED'
        ? ['printCertificate' as const]
        : []),
      ...(fulfillment === 'PRINTED' ? ['readyCertificate' as const] : []),
      ...(fulfillment === 'READY_FOR_COLLECTION' ? ['collectCertificate' as const] : []),
    ];
  }
  if (resource === 'roster')
    return [field(row.data, 'attendance.id') ? 'correctAttendance' : 'recordAttendance'];
  if (resource === 'certificates' && status === 'REVOKED') return ['reissueCertificate'];
  return [];
}

export const createActions: Partial<Record<ManagementResource, ManagementAction>> = {
  sessions: 'createSession',
  businessAccounts: 'createAccount',
  payments: 'recordPayment',
  invoices: 'createInvoice',
  certificates: 'issueCertificate',
  exports: 'createExport',
};

export type {
  FormValues,
  LookupType,
  ManagementField,
  ManagementTarget,
} from './action-fields';
export { actionFields } from './action-fields';
export { validateManagementAction, validateManagementFields } from './action-validation';
