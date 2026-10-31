import { accessScopes, permissions } from '@academyops/contracts';
import { PlgApiError } from './errors.js';
import type * as IAM from './iam-admin-models.js';

const permissionCodes = new Set<string>(permissions);
const scopes = new Set<string>(accessScopes);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
function uuid(value: unknown): value is string {
  return text(value) && uuidPattern.test(value);
}
function dateTime(value: unknown): value is string {
  return text(value) && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}
function nullableDateTime(value: unknown): value is string | null {
  return value === null || dateTime(value);
}
function version(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}
function page<T>(value: unknown, item: (entry: unknown) => entry is T): IAM.IamAdminPage<T> {
  if (
    !object(value) ||
    !Array.isArray(value.items) ||
    !value.items.every(item) ||
    !(value.nextCursor === null || uuid(value.nextCursor))
  ) {
    invalid();
  }
  return value as unknown as IAM.IamAdminPage<T>;
}
function branch(value: unknown): value is IAM.IamBranch {
  return (
    object(value) &&
    uuid(value.id) &&
    uuid(value.organizationId) &&
    text(value.code) &&
    text(value.name) &&
    typeof value.isActive === 'boolean' &&
    version(value.version) &&
    dateTime(value.createdAt) &&
    dateTime(value.updatedAt)
  );
}
function grant(value: unknown): value is IAM.IamPermissionGrant {
  return (
    object(value) &&
    text(value.permissionCode) &&
    permissionCodes.has(value.permissionCode) &&
    text(value.scope) &&
    scopes.has(value.scope)
  );
}
function role(value: unknown): value is IAM.IamRole {
  return (
    object(value) &&
    uuid(value.id) &&
    uuid(value.organizationId) &&
    text(value.code) &&
    text(value.name) &&
    typeof value.isSystem === 'boolean' &&
    version(value.version) &&
    dateTime(value.createdAt) &&
    dateTime(value.updatedAt)
  );
}
function roleWithGrants(value: unknown): value is IAM.IamRoleWithGrants {
  if (!object(value)) return false;
  const grants = value.grants;
  return role(value) && Array.isArray(grants) && grants.every(grant);
}
function identifier(value: unknown): value is IAM.IamUserIdentifier {
  return (
    object(value) &&
    (value.type === 'EMAIL' || value.type === 'PHONE') &&
    text(value.normalizedValue) &&
    nullableDateTime(value.verifiedAt)
  );
}
function userRole(value: unknown): value is IAM.IamUserRole {
  return object(value) && uuid(value.id) && text(value.code) && text(value.name);
}
function userBranch(value: unknown): value is IAM.IamUserBranch {
  return (
    object(value) &&
    uuid(value.id) &&
    text(value.code) &&
    text(value.name) &&
    typeof value.isActive === 'boolean'
  );
}
function user(value: unknown): value is IAM.IamUser {
  return (
    object(value) &&
    uuid(value.id) &&
    text(value.publicId) &&
    nullableText(value.name) &&
    (value.status === 'PENDING' || value.status === 'ACTIVE' || value.status === 'SUSPENDED') &&
    (value.preferredLocale === null ||
      value.preferredLocale === 'ar' ||
      value.preferredLocale === 'en') &&
    typeof value.mustChangePassword === 'boolean' &&
    version(value.version) &&
    nullableText(value.employeeCode) &&
    Array.isArray(value.identifiers) &&
    value.identifiers.every(identifier) &&
    Array.isArray(value.roles) &&
    value.roles.every(userRole) &&
    Array.isArray(value.branches) &&
    value.branches.every(userBranch) &&
    dateTime(value.createdAt) &&
    dateTime(value.updatedAt)
  );
}
export function validateIamBranch(value: unknown): IAM.IamBranch {
  if (!branch(value)) invalid();
  return value;
}
export function validateIamBranchesPage(value: unknown): IAM.IamAdminPage<IAM.IamBranch> {
  return page(value, branch);
}
export function validateIamRole(value: unknown): IAM.IamRole {
  if (!role(value)) invalid();
  return value;
}
export function validateIamRoleWithGrants(value: unknown): IAM.IamRoleWithGrants {
  if (!roleWithGrants(value)) invalid();
  return value;
}
export function validateIamRolesPage(value: unknown): IAM.IamAdminPage<IAM.IamRoleWithGrants> {
  return page(value, roleWithGrants);
}
export function validateIamReplaceGrants(value: unknown): IAM.IamReplaceGrantsResult {
  if (
    !object(value) ||
    !uuid(value.id) ||
    !version(value.version) ||
    !Array.isArray(value.grants) ||
    !value.grants.every(grant)
  ) {
    invalid();
  }
  return value as unknown as IAM.IamReplaceGrantsResult;
}
export function validateIamUser(value: unknown): IAM.IamUser {
  if (!user(value)) invalid();
  return value;
}
export function validateIamUsersPage(value: unknown): IAM.IamAdminPage<IAM.IamUser> {
  return page(value, user);
}
