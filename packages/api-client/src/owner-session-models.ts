import type { OwnerCohort, OwnerRoom } from './owner-models.js';
export type OwnerCohortModule = {
  id: string;
  cohortId: string;
  programVersionModuleId: string;
  ordinal: number;
  module: {
    id: string;
    code: string;
    name: string;
  } | null;
};
export type OwnerCohortDetail = OwnerCohort & {
  modules: OwnerCohortModule[];
};
export type OwnerSessionTrainer = {
  id: string;
  sessionId: string;
  trainerId: string;
  role: string;
  bookingStatus: string;
  trainer: {
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
  } | null;
};
export type OwnerSession = {
  id: string;
  cohortModuleId: string;
  cohortId: string;
  roomId: string | null;
  ordinal: number;
  startsAt: string | null;
  endsAt: string | null;
  deliveryMode: 'IN_PERSON' | 'ONLINE' | 'HYBRID';
  status: 'DRAFT' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  attendanceWindowState: string;
  version: number;
  cohort: OwnerCohort | null;
  room: OwnerRoom | null;
  trainers: OwnerSessionTrainer[];
  module: {
    id: string;
    code: string;
    name: string;
  } | null;
  coordinatorName: string | null;
};
export type OwnerSessionsPage = {
  items: OwnerSession[];
  nextCursor: string | null;
};
export type SessionMutationResult = {
  id: string;
  status: string;
  version: number;
};
export type CreateOwnerSessionInput = {
  cohortModuleId: string;
  cohortId: string;
  roomId?: string | undefined;
  ordinal: number;
  startsAt?: string | undefined;
  endsAt?: string | undefined;
  deliveryMode: 'IN_PERSON' | 'ONLINE' | 'HYBRID';
  trainers?:
    | Array<{
        trainerId: string;
        role?: 'PRIMARY' | 'ASSISTANT';
      }>
    | undefined;
};
export type RescheduleOwnerSessionInput = {
  roomId?: string | null | undefined;
  startsAt: string;
  endsAt: string;
  reason: string;
  trainers?:
    | Array<{
        trainerId: string;
        role?: 'PRIMARY' | 'ASSISTANT';
      }>
    | undefined;
};
export type PricingApprovalDetail = {
  id: string;
  status: string;
  version: number;
  lockVersion: number;
  subtotal: string;
  discountAmount: string;
  totalAmount: string;
  requiredApprovalTier: 1 | 2;
};
export type ApprovalDecisionResult = {
  id: string;
  status?: string;
  enrollmentId?: string;
  amount?: string;
};
