import type { AccessScope, PermissionCode } from '@academyops/contracts';
import type { paths } from './generated.js';

export type {
  DashboardOverview,
  DashboardPeriodQuery,
  DashboardRangeMeta,
} from './dashboard-models.js';
export type CurrentUser = {
  id: string;
  version: number;
  organization: {
    id: string;
    code: string;
    name: string;
  };
  name: string;
  preferredLocale: 'ar' | 'en' | null;
  localePreferenceSet: boolean;
  onboardingCompleted: boolean;
  branches: Array<{
    id: string;
    code: string;
    name: string;
  }>;
  roles: Array<{
    code: string;
    name: string;
  }>;
  permissions: Array<{
    code: PermissionCode;
    scopes: AccessScope[];
  }>;
  mfaRequired: boolean;
  mfaVerified: boolean;
  mfaSetupRequired: boolean;
  passwordChangeRequired: boolean;
};
export type SearchEntityType =
  | 'STUDENT'
  | 'LEAD'
  | 'PAYMENT'
  | 'INVOICE'
  | 'RECEIPT'
  | 'COHORT'
  | 'SESSION'
  | 'CERTIFICATE'
  | 'BUSINESS_ACCOUNT';
export type SearchResult = {
  entityType: SearchEntityType;
  id: string;
  labelAr: string;
  labelEn: string;
  secondary: string | null;
  status: string | null;
};
export type AuditEvent = {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  correlationId: string;
  before: unknown;
  after: unknown;
  metadata: unknown;
  createdAt: string;
  actor: {
    publicId: string;
    name: string | null;
  } | null;
};
export type AuditEventsPage = {
  items: AuditEvent[];
  nextCursor: string | null;
};
export type NotificationList = {
  unreadCount: number;
  items: Array<{
    id: string;
    type: string;
    subjectType: string | null;
    subjectId: string | null;
    payload: unknown;
    readAt: string | null;
    createdAt: string;
  }>;
  nextCursor: string | null;
};
export type ApiError = {
  code: string;
  messageKey: string;
  fieldErrors?: Array<{
    field: string;
    messageKey: string;
  }>;
  correlationId?: string;
};
export type RegisterStudentInput =
  paths['/api/v1/student-registrations']['post']['requestBody']['content']['application/json'];
export type RegistrationResponse =
  paths['/api/v1/student-registrations']['post']['responses']['202']['content']['application/json'];
export type StudentRegistrationDetail =
  paths['/api/v1/student-registrations/{id}']['get']['responses']['200']['content']['application/json'];
export type StudentRegistrationsPage =
  paths['/api/v1/student-registrations']['get']['responses']['200']['content']['application/json'];
export type ApproveStudentRegistrationInput =
  paths['/api/v1/student-registrations/{id}/approve']['post']['requestBody']['content']['application/json'];
export type RequestPhoneOtpInput =
  paths['/api/v1/auth/phone-otp/request']['post']['requestBody']['content']['application/json'];
export type RequestPhoneOtpResponse =
  paths['/api/v1/auth/phone-otp/request']['post']['responses']['202']['content']['application/json'];
export type VerifyPhoneOtpInput =
  paths['/api/v1/auth/phone-otp/verify']['post']['requestBody']['content']['application/json'];
export type VerifyPhoneOtpResponse =
  paths['/api/v1/auth/phone-otp/verify']['post']['responses']['201']['content']['application/json'];
export type FinanceReceivablesReport = {
  asOf: string;
  branchId: string | null;
  currencyCode: string;
  enrollmentCount: number;
  outstandingEnrollmentCount: number;
  totals: {
    debits: string;
    allocated: string;
    outstanding: string;
  };
};
export type ReportExport = {
  id: string;
  reportType: string;
  status: string;
  version: number;
  parameters: unknown;
  fileAssetId: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  expiresAt: string;
};
export type ReportExportsPage = {
  items: ReportExport[];
  nextCursor: string | null;
};
export type DownloadUrl = {
  url: string;
  expiresAt: string;
};
export type AgingBucket = 'CURRENT' | 'DAYS_1_30' | 'DAYS_31_60' | 'DAYS_61_90' | 'DAYS_91_PLUS';
export type FinanceAgingRow = {
  installmentId: string;
  enrollmentId: string | null;
  dueDate: string;
  ageDays: number;
  bucket: string;
  outstanding: string;
};
export type FinanceAgingReport = {
  asOf: string;
  currencyCode: string;
  totals: Record<string, string>;
  rows: FinanceAgingRow[];
};
export type AcademicCalendarQuery = {
  from: string;
  to: string;
  branchId?: string;
  cohortId?: string;
  roomId?: string;
  trainerId?: string;
};
export type SessionTrainerAssignment = {
  id: string;
  sessionId: string;
  trainerId: string;
  bookingStatus: string;
};
export type CalendarCohort = {
  id: string;
  code: string;
  name: string | null;
};
export type CalendarRoom = {
  id: string;
  code: string;
  name: string;
};
export type AcademicCalendarSession = {
  id: string;
  cohortId: string;
  roomId: string | null;
  startsAt: string;
  endsAt: string | null;
  deliveryMode: string;
  status: string;
  attendanceWindowState: string;
  cohort: CalendarCohort | null;
  room: CalendarRoom | null;
  trainers: SessionTrainerAssignment[];
};
export type AcademicCalendarResult = {
  from: string;
  to: string;
  items: AcademicCalendarSession[];
};
export type ProgramVersion = {
  id: string;
  programId: string;
  version: number;
  status: string;
};
export type StudentEnrollment = {
  id: string;
  version: number;
  studentPersonId: string;
  billingAccountId: string;
  programVersionId: string;
  homeBranchId: string;
  state: string;
  student: {
    id: string;
    publicId: string;
    name: string | null;
  } | null;
  programVersion: ProgramVersion | null;
  program: {
    id: string;
    code: string;
    name: string | null;
  } | null;
  cohort: {
    id: string;
    code: string;
    name: string | null;
  } | null;
};
export type StudentEnrollmentsPage = {
  items: StudentEnrollment[];
  nextCursor: string | null;
};
export type EnrollmentAttendanceSummary = {
  enrollmentId: string;
  numerator: number;
  denominator: number;
  ratio: string | null;
  minimumRatio: string;
  meetsPolicy: boolean;
  statusCounts: Record<string, number>;
  makeupCredits: number;
  policyId: string | null;
};
export type EnrollmentFinanceSummary = {
  billingAccountId: string;
  enrollmentId: string | null;
  currencyCode: string;
  totalDebits: string;
  totalCredits: string;
  balance: string;
  outstandingDebits: string;
  unappliedCredits: string;
};
export type StudentCertificate = {
  id: string;
  serial: string;
  enrollmentId: string;
  validityStatus: string;
  issuedAt: string;
  pdfStatus: 'PENDING_UPLOAD' | 'AVAILABLE';
  fulfillmentStatus?: string;
  version?: number;
  student?: {
    id: string;
    publicId: string;
    name: string | null;
  } | null;
};
export type CertificateDetail = StudentCertificate & {
  program?: {
    id: string;
    code: string;
    name: string;
  } | null;
  evaluation?: {
    attendanceRatio: string | null;
    academicResult: string;
    financialHold: boolean;
  } | null;
  events?: Array<{
    id: string;
    type: string;
    fromValue: string | null;
    toValue: string | null;
    occurredAt: string;
  }>;
};
export type StudentCertificatesPage = {
  items: StudentCertificate[];
  nextCursor: string | null;
};
export type CertificateRule = {
  id: string;
  programVersionId: string;
  cohortId: string | null;
  version: number;
  minimumRatio: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdBy: string;
  createdAt: string;
};
