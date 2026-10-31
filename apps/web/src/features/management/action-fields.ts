import type { ManagementResource, ManagementRow } from './config';

export type FormValues = Record<string, string>;
export type LookupType =
  | 'sessions'
  | 'students'
  | 'cohorts'
  | 'rooms'
  | 'trainers'
  | 'cohortModules'
  | 'enrollments'
  | 'businessAccounts'
  | 'paymentMethods'
  | 'ledgerEntries';
export type ManagementField = {
  name: string;
  type?: 'text' | 'datetime-local' | 'number' | 'lookup' | 'select';
  required?: boolean;
  options?: string[];
  lookup?: LookupType;
};

const required = (name: string, type: ManagementField['type'] = 'text'): ManagementField => ({
  name,
  type,
  required: true,
});
const lookup = (name: string, kind: LookupType, isRequired = true): ManagementField => ({
  name,
  type: 'lookup',
  lookup: kind,
  required: isRequired,
});
const reason = required('reason');

export function actionFields(
  action: import('./actions').ManagementAction,
  values: FormValues,
  originalStatus?: string,
): ManagementField[] {
  const account = [
    {
      name: 'accountType',
      type: 'select',
      required: true,
      options: ['STUDENT', 'BUSINESS'],
    } as ManagementField,
    ...(values.accountType === 'BUSINESS'
      ? [lookup('businessAccountId', 'businessAccounts')]
      : [lookup('studentId', 'students'), lookup('enrollmentId', 'enrollments')]),
  ];
  switch (action) {
    case 'createSession':
      return [
        lookup('cohortId', 'cohorts'),
        lookup('cohortModuleId', 'cohortModules'),
        required('ordinal', 'number'),
        {
          name: 'deliveryMode',
          type: 'select',
          required: true,
          options: ['IN_PERSON', 'ONLINE', 'HYBRID'],
        },
        lookup('roomId', 'rooms', values.deliveryMode !== 'ONLINE'),
        ...(values.trainers === undefined ? [lookup('trainerId', 'trainers', false)] : []),
        required('startsAt', 'datetime-local'),
        required('endsAt', 'datetime-local'),
      ];
    case 'reschedule':
      return [
        required('startsAt', 'datetime-local'),
        required('endsAt', 'datetime-local'),
        lookup('roomId', 'rooms', false),
        reason,
      ];
    case 'createAccount':
    case 'editAccount':
      return [
        required('legalName'),
        required('displayName'),
        { name: 'registrationNo' },
        { name: 'taxId' },
        ...(action === 'editAccount'
          ? [
              {
                name: 'status',
                type: 'select',
                required: true,
                options: originalStatus === 'ARCHIVED' ? ['ARCHIVED'] : ['ACTIVE', 'ARCHIVED'],
              } as ManagementField,
            ]
          : []),
      ];
    case 'recordAttendance':
    case 'correctAttendance':
      return [
        {
          name: 'status',
          type: 'select',
          required: true,
          options: ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'],
        },
        reason,
      ];
    case 'recordPayment':
      return [
        ...account,
        lookup('methodId', 'paymentMethods'),
        required('amount'),
        required('receivedAt', 'datetime-local'),
        {
          name: 'externalReference',
          required: ['INSTAPAY', 'VODAFONE_CASH', 'BANK_TRANSFER'].includes(
            values.paymentMethodCode ?? '',
          ),
        },
      ];
    case 'createInvoice':
      if (values.invoiceLines !== undefined) return account;
      return [
        ...account,
        lookup('ledgerEntryId', 'ledgerEntries'),
        required('description'),
        required('quantity'),
        required('unitAmount'),
        { name: 'taxAmount' },
      ];
    case 'evaluateCertificate':
    case 'issueCertificate':
      return [lookup('studentId', 'students'), lookup('enrollmentId', 'enrollments')];
    case 'requestRefund':
    case 'creditNote':
      return [required('amount'), reason];
    case 'rejectPayment':
    case 'rejectRefund':
    case 'withdrawRefund':
    case 'rejectReversal':
    case 'withdrawReversal':
    case 'cancelSession':
    case 'cancelInvoice':
    case 'voidInvoice':
    case 'revokeCertificate':
    case 'reissueCertificate':
    case 'requestReversal':
      return [reason];
    case 'completeSession':
      return [{ name: 'note' }];
    default:
      return [];
  }
}

export type ManagementTarget = {
  action: import('./actions').ManagementAction;
  resource: ManagementResource;
  row?: ManagementRow;
  sessionId?: string;
};
