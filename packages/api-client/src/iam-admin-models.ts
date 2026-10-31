import type { AccessScope, PermissionCode } from '@academyops/contracts';
export type IamAdminPage<T> = {
  items: T[];
  nextCursor: string | null;
};
export type IamAdminListQuery = {
  search?: string | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
};
export type IamAdminUsersQuery = IamAdminListQuery & {
  status?: IamUserStatus | undefined;
};
export type IamUserStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED';
export type IamBranch = {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type IamPermissionGrant = {
  permissionCode: PermissionCode;
  scope: AccessScope;
};
export type IamRole = {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  isSystem: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type IamRoleWithGrants = IamRole & {
  grants: IamPermissionGrant[];
};
export type IamReplaceGrantsResult = {
  id: string;
  version: number;
  grants: IamPermissionGrant[];
};
export type IamUserIdentifier = {
  type: 'EMAIL' | 'PHONE';
  normalizedValue: string;
  verifiedAt: string | null;
};
export type IamUserRole = {
  id: string;
  code: string;
  name: string;
};
export type IamUserBranch = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
};
export type IamUser = {
  id: string;
  publicId: string;
  name: string | null;
  status: IamUserStatus;
  preferredLocale: 'ar' | 'en' | null;
  mustChangePassword: boolean;
  version: number;
  employeeCode: string | null;
  identifiers: IamUserIdentifier[];
  roles: IamUserRole[];
  branches: IamUserBranch[];
  createdAt: string;
  updatedAt: string;
};
export type CreateIamBranchInput = {
  code: string;
  name: string;
};
export type UpdateIamBranchInput = {
  name?: string | undefined;
  isActive?: boolean | undefined;
};
export type CreateIamRoleInput = {
  code: string;
  name: string;
  grants: IamPermissionGrant[];
};
export type UpdateIamRoleInput = {
  name?: string | undefined;
};
export type CreateIamUserInput = {
  name?: string | undefined;
  email: string;
  employeeCode?: string | undefined;
  preferredLocale?: 'ar' | 'en' | undefined;
  temporaryPassword?: string | undefined;
  activateNow?: boolean | undefined;
  activationReason?: string | undefined;
  roleIds: string[];
  branchIds: string[];
};
export type UpdateIamUserStatusInput = {
  status: 'ACTIVE' | 'SUSPENDED';
  reason: string;
};
export type ReplaceIamAssignmentsInput = {
  ids: string[];
  reason: string;
};
