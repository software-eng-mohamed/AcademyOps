export type LeadState = 'NEW' | 'OPEN' | 'QUALIFIED' | 'WON' | 'LOST' | 'DISQUALIFIED';
export type LeadPerson = {
  id: string;
  publicId: string;
  name: string | null;
};
export type LeadContact = {
  id: string;
  personId: string;
  type: 'PHONE' | 'EMAIL';
  rawValue: string;
  normalizedValue: string | null;
  isPrimary: boolean;
};
export type LeadStage = {
  id: string;
  code: string;
  name: string;
  ordinal: number;
  isActive: boolean;
  version: number;
};
export type CreateLeadStageInput = {
  code: string;
  name: string;
  ordinal: number;
};
export type UpdateLeadStageInput = {
  name?: string;
  ordinal?: number;
  isActive?: boolean;
};
export type LeadActivity = {
  id: string;
  leadId: string;
  actorUserId: string;
  type: 'CALL' | 'EMAIL' | 'WHATSAPP' | 'MEETING' | 'NOTE';
  occurredAt: string;
  data: Record<string, unknown> | null;
  createdAt: string;
};
export type LeadHistory = {
  id: string;
  leadId: string;
  fromState: LeadState | null;
  toState: LeadState;
  reason: string | null;
  actorUserId: string;
  occurredAt: string;
};
export type Lead = {
  id: string;
  branchId: string;
  assignedUserId: string | null;
  personId: string | null;
  stageId: string | null;
  state: LeadState;
  source: string | null;
  nextActionAt: string | null;
  lostReason: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  person: LeadPerson | null;
  contacts: LeadContact[];
  stage: LeadStage | null;
  activities?: LeadActivity[];
  history?: LeadHistory[];
};
export type LeadsPage = {
  items: Lead[];
  nextCursor: string | null;
};
export type LeadAssignee = {
  userId: string;
  personId: string;
  publicId: string;
  name: string | null;
  employeeCode: string | null;
};
export type BusinessContactCandidate = {
  personId: string;
  publicId: string;
  name: string | null;
  contacts: Array<{
    type: string;
    rawValue: string;
    isPrimary: boolean;
  }>;
};
export type BusinessAccount = {
  id: string;
  owningBranchId: string;
  legalName: string;
  displayName: string;
  registrationNo: string | null;
  taxId: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type BusinessAccountDetail = BusinessAccount & {
  billingAccount: {
    id: string;
    kind: 'CORPORATE';
    currencyCode: string;
    version: number;
  } | null;
  contacts: Array<{
    id: string;
    personId: string;
    role: string | null;
    isPrimary: boolean;
    person: LeadPerson | null;
  }>;
};
export type BusinessAccountsPage = {
  items: BusinessAccount[];
  nextCursor: string | null;
};
export type CreateBusinessAccountInput = {
  owningBranchId: string;
  legalName: string;
  displayName: string;
  registrationNo?: string;
  taxId?: string;
};
export type UpdateBusinessAccountInput = {
  legalName?: string;
  displayName?: string;
  registrationNo?: string;
  taxId?: string;
  status?: 'ACTIVE' | 'ARCHIVED';
};
export type BusinessAccountContactInput = {
  personId: string;
  role?: string;
  isPrimary?: boolean;
};
export type LeadConversionInput = {
  programVersionId: string;
  billingAccountId?: string;
  homeBranchId: string;
  cohortId: string;
  kind: 'INDIVIDUAL' | 'CORPORATE';
};
export type LeadConversionResult = {
  leadId: string;
  personId: string;
  enrollmentId: string;
  version: number;
};
