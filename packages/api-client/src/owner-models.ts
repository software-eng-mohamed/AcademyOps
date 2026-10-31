export type CatalogQuery = {
  search?: string | undefined;
  status?: string | undefined;
  branchId?: string | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
};
export type AuditEventsQuery = {
  action?: string;
  entityType?: string;
  actorUserId?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
};
export type OwnerPage<T> = {
  items: T[];
  nextCursor: string | null;
};
export type OwnerStudent = {
  id: string;
  publicId: string;
  name: string | null;
  birthDate: string | null;
  gender: 'MALE' | 'FEMALE' | null;
  version: number;
  studentProfile: {
    id: string;
    portalStatus: string;
    version: number;
  } | null;
  enrollmentSummary: StudentEnrollmentSummary;
};
export type OwnerStudentIdentityMutation = {
  id: string;
  publicId: string;
  name: string | null;
  birthDate: string | null;
  gender: 'MALE' | 'FEMALE' | null;
  version: number;
};
export type StudentEnrollmentSummary = {
  total: number;
  active: number;
  latestState: string | null;
  program: StudentProgramRef | null;
  cohort: StudentCohortRef | null;
  branch: StudentBranchRef | null;
};
export type StudentProgramRef = {
  id: string;
  code: string;
  name: string;
};
export type StudentCohortRef = {
  id: string;
  code: string;
  name: string | null;
  status: string;
  startsOn: string | null;
  endsOn: string | null;
};
export type StudentBranchRef = {
  id: string;
  code: string;
  name: string;
};
export type OwnerStudentDetail = OwnerStudent & {
  contacts: Array<{
    id: string;
    type: 'PHONE' | 'EMAIL';
    rawValue: string;
    normalizedValue: string | null;
    isPrimary: boolean;
  }>;
  enrollments: Array<{
    id: string;
    studentPersonId: string;
    state: string;
    kind: string;
    homeBranchId: string;
    programVersionId: string;
    activatedAt: string | null;
    completedAt: string | null;
    cancelledAt: string | null;
    createdAt: string;
    version: number;
    programVersion: {
      id: string;
      programId: string;
      version: number;
      status: string;
    } | null;
    program: StudentProgramRef | null;
    cohort: StudentCohortRef | null;
    cohortStartedAt: string | null;
    branch: StudentBranchRef | null;
    finance?: {
      currencyCode: 'EGP';
      subtotal: number | null;
      discountAmount: number | null;
      totalAmount: number | null;
      paidAmount: number;
      outstandingBalance: number;
      paymentCount: number;
    } | null;
    attendance?: {
      total: number;
      present: number;
      absent: number;
      late: number;
      excused: number;
      rate: number;
    } | null;
    certificate?: {
      importedStatus: string | null;
      issuedCount: number;
      latest: {
        id: string;
        serial: string;
        validityStatus: string;
        fulfillmentStatus: string;
        pdfStatus: string;
        issuedAt: string;
      } | null;
    } | null;
    source: {
      legacyCode: string | null;
      legacyState: string | null;
      telesalesAgent: string | null;
      acquisitionSource: string | null;
      secondaryCode: string | null;
      deliveryMode: string | null;
      rowNumber: number | null;
      importedAt: string | null;
      workbookShouldPaid?: number | null;
      workbookRemaining?: number | null;
    } | null;
  }>;
  possibleDuplicates?: Array<{
    personId: string;
    publicId: string;
    name: string | null;
    reasons: string[];
  }>;
};
export type StudentContactInput = {
  type: 'PHONE' | 'EMAIL';
  value: string;
  isPrimary?: boolean;
};
export type StudentContactsMutation = {
  id: string;
  version: number;
  contacts: Array<{
    type: 'PHONE' | 'EMAIL';
    rawValue: string;
    normalizedValue: string | null;
    isPrimary: boolean;
  }>;
};
export type StudentMergeResult = {
  sourcePersonId: string;
  targetPersonId: string;
  targetVersion: number;
  movedEnrollments: number;
  movedBillingAccounts: number;
};
export type OwnerProgramVersion = {
  id: string;
  programId: string;
  version: number;
  status: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  recordVersion: number;
};
export type OwnerProgramVersionDetail = OwnerProgramVersion & {
  modules: Array<{
    id: string;
    moduleId: string;
    ordinal: number;
    required: boolean;
    module: OwnerModule | null;
  }>;
};
export type OwnerProgram = {
  id: string;
  code: string;
  name: string;
  status: string;
  version: number;
  versions: OwnerProgramVersion[];
};
export type OwnerModule = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  version: number;
};
export type CurriculumLine = {
  moduleId: string;
  ordinal: number;
  required?: boolean;
};
export type OwnerCohort = {
  id: string;
  programVersionId: string;
  owningBranchId: string;
  code: string;
  name: string | null;
  status: string;
  startsOn: string | null;
  endsOn: string | null;
  capacity: number | null;
  version: number;
  scheduleFirstAt: string | null;
  scheduleLastAt: string | null;
  sourceSessionCount: number;
  scheduledSessionCount: number;
  scheduleConflictCount: number;
  scheduleState: 'NO_SOURCE_SCHEDULE' | 'NEEDS_REVIEW' | 'UPCOMING' | 'IN_PROGRESS' | 'ENDED';
  learnerCount: number;
  sourceAliases: string[];
  capacitySource: 'NOT_PROVIDED' | 'SYSTEM';
};
export type OwnerRoom = {
  id: string;
  branchId: string;
  code: string;
  name: string;
  capacity: number | null;
  isActive: boolean;
  version: number;
  scheduledSessions: number;
  cohortCount: number;
  firstSessionAt: string | null;
  lastSessionAt: string | null;
  capacitySource: 'NOT_PROVIDED' | 'SYSTEM';
};
export type OwnerTrainer = {
  id: string;
  personId: string;
  status: string;
  biographyAr: string | null;
  biographyEn: string | null;
  version: number;
  person: {
    id: string;
    publicId: string;
    name: string | null;
  } | null;
  scheduledSessions: number;
  cohortCount: number;
  firstSessionAt: string | null;
  lastSessionAt: string | null;
};
export type CreateStudentInput = {
  name?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  birthDate?: string | undefined;
  gender?: 'MALE' | 'FEMALE' | undefined;
  branchId?: string | undefined;
  confirmDistinctFromPersonIds?: string[] | undefined;
};
export type CreateEnrollmentInput = {
  studentPersonId: string;
  programVersionId: string;
  billingAccountId?: string;
  homeBranchId: string;
  cohortId: string;
  kind: 'INDIVIDUAL' | 'CORPORATE';
};
export type OwnerMutation = {
  id: string;
  version: number;
};
