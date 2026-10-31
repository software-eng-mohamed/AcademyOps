import { PlgApiError } from './errors.js';
import type {
  OwnerCohort,
  OwnerModule,
  OwnerPage,
  OwnerProgram,
  OwnerRoom,
  OwnerStudent,
  OwnerStudentDetail,
  OwnerTrainer,
} from './owner-models.js';

function invalid(): never {
  throw new PlgApiError(500, { code: 'RESPONSE_INVALID', messageKey: 'errors.requestFailed' });
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === 'string';
}
function nullableText(value: unknown): value is string | null {
  return value === null || text(value);
}
function page<T>(value: unknown, item: (entry: unknown) => entry is T): OwnerPage<T> {
  if (!object(value) || !Array.isArray(value.items) || !nullableText(value.nextCursor)) invalid();
  if (!value.items.every(item)) invalid();
  return value as unknown as OwnerPage<T>;
}
function versioned(value: unknown): value is Record<string, unknown> {
  return object(value) && text(value.id) && typeof value.version === 'number';
}
function number(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function nullableObject(value: unknown): value is Record<string, unknown> | null {
  return value === null || object(value);
}
function isEnrollmentSummary(value: unknown): boolean {
  return (
    object(value) &&
    number(value.total) &&
    number(value.active) &&
    nullableText(value.latestState) &&
    nullableObject(value.program) &&
    nullableObject(value.cohort) &&
    nullableObject(value.branch)
  );
}
function isStudent(value: unknown): value is OwnerStudent {
  return (
    versioned(value) &&
    text(value.publicId) &&
    nullableText(value.name) &&
    nullableText(value.birthDate) &&
    (value.gender === null || value.gender === 'MALE' || value.gender === 'FEMALE') &&
    (value.studentProfile === null || object(value.studentProfile)) &&
    isEnrollmentSummary(value.enrollmentSummary)
  );
}
function isStudentDetail(value: unknown): value is OwnerStudentDetail {
  if (!isStudent(value)) return false;
  const detail = value as unknown as Record<string, unknown>;
  return (
    Array.isArray(detail.contacts) &&
    detail.contacts.every(
      (contact) =>
        object(contact) &&
        text(contact.id) &&
        (contact.type === 'PHONE' || contact.type === 'EMAIL') &&
        text(contact.rawValue) &&
        nullableText(contact.normalizedValue) &&
        typeof contact.isPrimary === 'boolean',
    ) &&
    Array.isArray(detail.enrollments) &&
    detail.enrollments.every(
      (enrollment) =>
        versioned(enrollment) &&
        text(enrollment.state) &&
        text(enrollment.kind) &&
        text(enrollment.homeBranchId) &&
        text(enrollment.programVersionId) &&
        nullableObject(enrollment.programVersion) &&
        nullableObject(enrollment.program) &&
        nullableObject(enrollment.cohort) &&
        nullableObject(enrollment.branch) &&
        nullableText(enrollment.activatedAt) &&
        nullableText(enrollment.completedAt) &&
        nullableText(enrollment.cancelledAt) &&
        nullableText(enrollment.cohortStartedAt) &&
        nullableObject(enrollment.source) &&
        (enrollment.finance === undefined || nullableObject(enrollment.finance)) &&
        (enrollment.attendance === undefined || nullableObject(enrollment.attendance)) &&
        (enrollment.certificate === undefined || nullableObject(enrollment.certificate)),
    ) &&
    (detail.possibleDuplicates === undefined ||
      (Array.isArray(detail.possibleDuplicates) &&
        detail.possibleDuplicates.every(
          (candidate) =>
            object(candidate) &&
            text(candidate.personId) &&
            text(candidate.publicId) &&
            nullableText(candidate.name) &&
            Array.isArray(candidate.reasons) &&
            candidate.reasons.every(text),
        )))
  );
}
function isProgram(value: unknown): value is OwnerProgram {
  return (
    versioned(value) &&
    text(value.code) &&
    text(value.name) &&
    text(value.status) &&
    Array.isArray(value.versions)
  );
}
function isModule(value: unknown): value is OwnerModule {
  return (
    versioned(value) && text(value.code) && text(value.name) && typeof value.isActive === 'boolean'
  );
}
function isCohort(value: unknown): value is OwnerCohort {
  return (
    versioned(value) &&
    text(value.programVersionId) &&
    text(value.owningBranchId) &&
    text(value.code) &&
    nullableText(value.name) &&
    text(value.status) &&
    nullableText(value.scheduleFirstAt) &&
    nullableText(value.scheduleLastAt) &&
    typeof value.sourceSessionCount === 'number' &&
    typeof value.scheduledSessionCount === 'number' &&
    typeof value.scheduleConflictCount === 'number' &&
    text(value.scheduleState) &&
    typeof value.learnerCount === 'number' &&
    Array.isArray(value.sourceAliases) &&
    value.sourceAliases.every(text) &&
    ['NOT_PROVIDED', 'SYSTEM'].includes(String(value.capacitySource))
  );
}
function isRoom(value: unknown): value is OwnerRoom {
  return (
    versioned(value) &&
    text(value.branchId) &&
    text(value.code) &&
    text(value.name) &&
    typeof value.isActive === 'boolean' &&
    typeof value.scheduledSessions === 'number' &&
    typeof value.cohortCount === 'number' &&
    nullableText(value.firstSessionAt) &&
    nullableText(value.lastSessionAt) &&
    ['NOT_PROVIDED', 'SYSTEM'].includes(String(value.capacitySource))
  );
}
function isTrainer(value: unknown): value is OwnerTrainer {
  return (
    versioned(value) &&
    text(value.personId) &&
    text(value.status) &&
    typeof value.scheduledSessions === 'number' &&
    typeof value.cohortCount === 'number' &&
    nullableText(value.firstSessionAt) &&
    nullableText(value.lastSessionAt)
  );
}
export const validateStudentsPage = (value: unknown) => page(value, isStudent);
export function validateStudentDetail(value: unknown): OwnerStudentDetail {
  if (!isStudentDetail(value)) invalid();
  return value;
}
export const validateProgramsPage = (value: unknown) => page(value, isProgram);
export const validateModulesPage = (value: unknown) => page(value, isModule);
export const validateCohortsPage = (value: unknown) => page(value, isCohort);
export const validateRoomsPage = (value: unknown) => page(value, isRoom);
export const validateTrainersPage = (value: unknown) => page(value, isTrainer);
