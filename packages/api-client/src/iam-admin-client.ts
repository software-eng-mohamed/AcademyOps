import { buildQuery } from './base.js';
import type * as IAM from './iam-admin-models.js';
import {
  validateIamBranch,
  validateIamBranchesPage,
  validateIamReplaceGrants,
  validateIamRole,
  validateIamRolesPage,
  validateIamRoleWithGrants,
  validateIamUser,
  validateIamUsersPage,
} from './iam-admin-validators.js';
import { PlgImportClient } from './import-client.js';

export class PlgIamAdminClient extends PlgImportClient {
  async listBranches(query: IAM.IamAdminListQuery = {}) {
    return validateIamBranchesPage(await this.request('GET', `/branches${buildQuery(query)}`));
  }

  async getBranch(id: string) {
    return validateIamBranch(await this.request('GET', `/branches/${encodeURIComponent(id)}`));
  }

  async createBranch(input: IAM.CreateIamBranchInput) {
    return validateIamBranch(await this.request('POST', '/branches', input));
  }

  async updateBranch(id: string, input: IAM.UpdateIamBranchInput, version: number) {
    return validateIamBranch(
      await this.request('PATCH', `/branches/${encodeURIComponent(id)}`, input, {
        'If-Match': String(version),
      }),
    );
  }

  async listRoles(query: IAM.IamAdminListQuery = {}) {
    return validateIamRolesPage(await this.request('GET', `/roles${buildQuery(query)}`));
  }

  async getRole(id: string) {
    return validateIamRoleWithGrants(await this.request('GET', `/roles/${encodeURIComponent(id)}`));
  }

  async createRole(input: IAM.CreateIamRoleInput) {
    return validateIamRoleWithGrants(await this.request('POST', '/roles', input));
  }

  async updateRole(id: string, input: IAM.UpdateIamRoleInput, version: number) {
    return validateIamRole(
      await this.request('PATCH', `/roles/${encodeURIComponent(id)}`, input, {
        'If-Match': String(version),
      }),
    );
  }

  async replaceRoleGrants(id: string, grants: IAM.IamPermissionGrant[], version: number) {
    return validateIamReplaceGrants(
      await this.request(
        'PUT',
        `/roles/${encodeURIComponent(id)}/grants`,
        { grants },
        { 'If-Match': String(version) },
      ),
    );
  }

  async listUsers(query: IAM.IamAdminUsersQuery = {}) {
    return validateIamUsersPage(await this.request('GET', `/users${buildQuery(query)}`));
  }

  async getUser(id: string) {
    return validateIamUser(await this.request('GET', `/users/${encodeURIComponent(id)}`));
  }

  async createUser(input: IAM.CreateIamUserInput) {
    return validateIamUser(await this.request('POST', '/users', input));
  }

  async updateUserStatus(id: string, input: IAM.UpdateIamUserStatusInput, version: number) {
    return validateIamUser(
      await this.request('PATCH', `/users/${encodeURIComponent(id)}/status`, input, {
        'If-Match': String(version),
      }),
    );
  }

  async replaceUserRoles(id: string, input: IAM.ReplaceIamAssignmentsInput, version: number) {
    return validateIamUser(
      await this.request('PUT', `/users/${encodeURIComponent(id)}/roles`, input, {
        'If-Match': String(version),
      }),
    );
  }

  async replaceUserBranches(id: string, input: IAM.ReplaceIamAssignmentsInput, version: number) {
    return validateIamUser(
      await this.request('PUT', `/users/${encodeURIComponent(id)}/branches`, input, {
        'If-Match': String(version),
      }),
    );
  }
}
