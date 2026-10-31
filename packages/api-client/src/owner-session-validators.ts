import { PlgApiError } from './errors.js';
import type { OwnerCohort } from './owner-models.js';
import type {
  ApprovalDecisionResult,
  OwnerCohortDetail,
  OwnerSession,
  OwnerSessionsPage,
  PricingApprovalDetail,
  SessionMutationResult,
} from './owner-session-models.js';

function invalid(): never {
  throw new PlgApiError(500, { code: 'RESPONSE_INVALID', messageKey: 'errors.requestFailed' });
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function nullableText(value: unknown) {
  return value === null || typeof value === 'string';
}
function nullableNumber(value: unknown) {
  return value === null || typeof value === 'number';
}
function cohort(value: unknown): value is OwnerCohort {
  return (
    object(value) &&
    typeof value.id === 'string' &&
    typeof value.programVersionId === 'string' &&
    typeof value.owningBranchId === 'string' &&
    typeof value.code === 'string' &&
    nullableText(value.name) &&
    typeof value.status === 'string' &&
    nullableText(value.startsOn) &&
    nullableText(value.endsOn) &&
    nullableNumber(value.capacity) &&
    typeof value.version === 'number'
  );
}
function room(value: unknown) {
  return (
    object(value) &&
    typeof value.id === 'string' &&
    typeof value.branchId === 'string' &&
    typeof value.code === 'string' &&
    typeof value.name === 'string' &&
    nullableNumber(value.capacity) &&
    typeof value.isActive === 'boolean' &&
    typeof value.version === 'number'
  );
}
function trainerAssignment(value: unknown) {
  if (
    !object(value) ||
    typeof value.id !== 'string' ||
    typeof value.sessionId !== 'string' ||
    typeof value.trainerId !== 'string' ||
    typeof value.role !== 'string' ||
    typeof value.bookingStatus !== 'string'
  )
    return false;
  if (value.trainer === null) return true;
  if (!object(value.trainer)) return false;
  if (
    !(
      typeof value.trainer.id === 'string' &&
      typeof value.trainer.personId === 'string' &&
      typeof value.trainer.status === 'string' &&
      nullableText(value.trainer.biographyAr) &&
      nullableText(value.trainer.biographyEn) &&
      typeof value.trainer.version === 'number'
    )
  )
    return false;
  if (value.trainer.person === null) return true;
  return (
    object(value.trainer.person) &&
    typeof value.trainer.person.id === 'string' &&
    typeof value.trainer.person.publicId === 'string' &&
    nullableText(value.trainer.person.name)
  );
}
function sourceModule(value: unknown) {
  return (
    object(value) &&
    typeof value.id === 'string' &&
    typeof value.code === 'string' &&
    typeof value.name === 'string' &&
    typeof value.name === 'string'
  );
}
function session(value: unknown): value is OwnerSession {
  if (!object(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.cohortModuleId === 'string' &&
    typeof value.cohortId === 'string' &&
    nullableText(value.roomId) &&
    typeof value.ordinal === 'number' &&
    nullableText(value.startsAt) &&
    nullableText(value.endsAt) &&
    ['IN_PERSON', 'ONLINE', 'HYBRID'].includes(String(value.deliveryMode)) &&
    ['DRAFT', 'SCHEDULED', 'COMPLETED', 'CANCELLED'].includes(String(value.status)) &&
    typeof value.attendanceWindowState === 'string' &&
    typeof value.version === 'number' &&
    (value.cohort === null || cohort(value.cohort)) &&
    (value.room === null || room(value.room)) &&
    Array.isArray(value.trainers) &&
    value.trainers.every(trainerAssignment) &&
    (value.module === null || sourceModule(value.module)) &&
    nullableText(value.coordinatorName)
  );
}
export function validateOwnerSessionsPage(value: unknown): OwnerSessionsPage {
  if (!object(value) || !Array.isArray(value.items) || !nullableText(value.nextCursor)) invalid();
  if (!value.items.every(session)) invalid();
  return value as unknown as OwnerSessionsPage;
}
export function validateOwnerCohortDetail(value: unknown): OwnerCohortDetail {
  if (!cohort(value)) invalid();
  const record = value as unknown as Record<string, unknown>;
  if (!Array.isArray(record.modules)) invalid();
  for (const item of record.modules) {
    if (
      !object(item) ||
      typeof item.id !== 'string' ||
      typeof item.cohortId !== 'string' ||
      typeof item.programVersionModuleId !== 'string' ||
      typeof item.ordinal !== 'number' ||
      (item.module !== null && !sourceModule(item.module))
    )
      invalid();
  }
  return value as unknown as OwnerCohortDetail;
}
export function validateSessionMutation(value: unknown): SessionMutationResult {
  if (
    !object(value) ||
    typeof value.id !== 'string' ||
    !['DRAFT', 'SCHEDULED', 'COMPLETED', 'CANCELLED'].includes(String(value.status)) ||
    typeof value.version !== 'number'
  )
    invalid();
  return value as unknown as SessionMutationResult;
}
export function validatePricingApproval(value: unknown): PricingApprovalDetail {
  if (
    !object(value) ||
    typeof value.id !== 'string' ||
    typeof value.status !== 'string' ||
    typeof value.version !== 'number' ||
    typeof value.lockVersion !== 'number' ||
    typeof value.subtotal !== 'string' ||
    typeof value.discountAmount !== 'string' ||
    typeof value.totalAmount !== 'string' ||
    ![1, 2].includes(Number(value.requiredApprovalTier))
  )
    invalid();
  return value as unknown as PricingApprovalDetail;
}
export function validateApprovalDecision(value: unknown): ApprovalDecisionResult {
  if (!object(value) || typeof value.id !== 'string') invalid();
  if (value.status !== undefined && typeof value.status !== 'string') invalid();
  if (value.enrollmentId !== undefined && typeof value.enrollmentId !== 'string') invalid();
  if (value.amount !== undefined && typeof value.amount !== 'string') invalid();
  return value as ApprovalDecisionResult;
}
