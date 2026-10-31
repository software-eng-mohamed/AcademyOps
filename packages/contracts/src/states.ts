import { DomainTransitionError } from './errors.js';

export const leadStates = ['NEW', 'OPEN', 'QUALIFIED', 'WON', 'LOST', 'DISQUALIFIED'] as const;
export type LeadState = (typeof leadStates)[number];
export type LeadCommand = 'open' | 'qualify' | 'win' | 'lose' | 'disqualify' | 'reopen';

export const enrollmentStates = [
  'DRAFT',
  'PENDING_APPROVAL',
  'ACTIVE',
  'POSTPONED',
  'COMPLETED',
  'CANCELLED',
] as const;
export type EnrollmentState = (typeof enrollmentStates)[number];
export type EnrollmentCommand =
  | 'submit'
  | 'activate'
  | 'reject'
  | 'postpone'
  | 'resume'
  | 'complete'
  | 'cancel';

export const paymentStates = ['PENDING_VERIFICATION', 'POSTED', 'REJECTED', 'REVERSED'] as const;
export type PaymentState = (typeof paymentStates)[number];
export type PaymentCommand = 'post' | 'reject' | 'reverse';

export const invoiceStates = ['DRAFT', 'ISSUED', 'CANCELLED', 'VOIDED'] as const;
export type InvoiceState = (typeof invoiceStates)[number];
export type InvoiceCommand = 'issue' | 'cancel' | 'void';

export const attendanceWindowStates = ['SCHEDULED', 'OPEN', 'CLOSED', 'LOCKED'] as const;
export type AttendanceWindowState = (typeof attendanceWindowStates)[number];
export type AttendanceWindowCommand = 'open' | 'close' | 'lock';

export const attendanceStatuses = ['UNMARKED', 'PRESENT', 'LATE', 'ABSENT', 'EXCUSED'] as const;
export type AttendanceStatus = (typeof attendanceStatuses)[number];

export const eligibilityStates = ['PENDING', 'ELIGIBLE', 'INELIGIBLE'] as const;
export type EligibilityState = (typeof eligibilityStates)[number];
export const certificateValidityStates = ['ISSUED', 'REVOKED'] as const;
export type CertificateValidityState = (typeof certificateValidityStates)[number];
export const certificateFulfillmentStates = [
  'NOT_PRINTED',
  'PRINTED',
  'READY_FOR_COLLECTION',
  'COLLECTED',
] as const;
export type CertificateFulfillmentState = (typeof certificateFulfillmentStates)[number];
export const certificatePdfStates = ['PENDING_UPLOAD', 'AVAILABLE'] as const;
export type CertificatePdfState = (typeof certificatePdfStates)[number];

const transitions = {
  lead: {
    NEW: { open: 'OPEN', lose: 'LOST', disqualify: 'DISQUALIFIED' },
    OPEN: { qualify: 'QUALIFIED', lose: 'LOST', disqualify: 'DISQUALIFIED' },
    QUALIFIED: { win: 'WON', lose: 'LOST', disqualify: 'DISQUALIFIED' },
    WON: {},
    LOST: { reopen: 'OPEN' },
    DISQUALIFIED: { reopen: 'OPEN' },
  },
  enrollment: {
    DRAFT: { submit: 'PENDING_APPROVAL', activate: 'ACTIVE' },
    PENDING_APPROVAL: { activate: 'ACTIVE', reject: 'DRAFT' },
    ACTIVE: { postpone: 'POSTPONED', complete: 'COMPLETED', cancel: 'CANCELLED' },
    POSTPONED: { resume: 'ACTIVE', complete: 'COMPLETED', cancel: 'CANCELLED' },
    COMPLETED: {},
    CANCELLED: {},
  },
  payment: {
    PENDING_VERIFICATION: { post: 'POSTED', reject: 'REJECTED' },
    POSTED: { reverse: 'REVERSED' },
    REJECTED: {},
    REVERSED: {},
  },
  invoice: {
    DRAFT: { issue: 'ISSUED', cancel: 'CANCELLED' },
    ISSUED: { void: 'VOIDED' },
    CANCELLED: {},
    VOIDED: {},
  },
  attendanceWindow: {
    SCHEDULED: { open: 'OPEN' },
    OPEN: { close: 'LOCKED' },
    CLOSED: { lock: 'LOCKED' },
    LOCKED: {},
  },
} as const;

function nextState<TState extends string, TCommand extends string>(
  aggregate: string,
  state: TState,
  command: TCommand,
  map: Readonly<Record<string, Readonly<Record<string, string>>>>,
): TState {
  const next = map[state]?.[command];
  if (!next) throw new DomainTransitionError(aggregate, state, command);
  return next as TState;
}

export const transitionLead = (state: LeadState, command: LeadCommand): LeadState =>
  nextState('Lead', state, command, transitions.lead);

export const transitionEnrollment = (
  state: EnrollmentState,
  command: EnrollmentCommand,
): EnrollmentState => nextState('Enrollment', state, command, transitions.enrollment);

export const transitionPayment = (state: PaymentState, command: PaymentCommand): PaymentState =>
  nextState('Payment', state, command, transitions.payment);

export const transitionInvoice = (state: InvoiceState, command: InvoiceCommand): InvoiceState =>
  nextState('Invoice', state, command, transitions.invoice);

export const transitionAttendanceWindow = (
  state: AttendanceWindowState,
  command: AttendanceWindowCommand,
): AttendanceWindowState =>
  nextState('AttendanceWindow', state, command, transitions.attendanceWindow);
