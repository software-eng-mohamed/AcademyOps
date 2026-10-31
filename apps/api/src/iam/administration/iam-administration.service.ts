import { Injectable } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { IamBranchAdministrationService } from './iam-branch-administration.service';
import { IamRoleAdministrationService } from './iam-role-administration.service';
import { IamUserReadService } from './iam-user-read.service';
import { IamUserLifecycleService } from './iam-user-lifecycle.service';
import { IamUserAssignmentService } from './iam-user-assignment.service';
import type {
  CreateBranchDto,
  CreateRoleDto,
  CreateUserDto,
  ListAdministrationDto,
  ListUsersDto,
  ReplaceAssignmentsDto,
  ReplaceRoleGrantsDto,
  UpdateBranchDto,
  UpdateRoleDto,
  UpdateUserStatusDto,
} from './iam-administration.dto';

@Injectable()
export class IamAdministrationService {
  constructor(
    private readonly branchAdmin: IamBranchAdministrationService,
    private readonly roleAdmin: IamRoleAdministrationService,
    private readonly userRead: IamUserReadService,
    private readonly userLifecycle: IamUserLifecycleService,
    private readonly userAssignment: IamUserAssignmentService,
  ) {}

  listBranches(access: AccessContext, input: ListAdministrationDto) {
    return this.branchAdmin.listBranches(access, input);
  }

  readBranch(access: AccessContext, id: string) {
    return this.branchAdmin.readBranch(access, id);
  }

  createBranch(access: AccessContext, input: CreateBranchDto, correlationId: string) {
    return this.branchAdmin.createBranch(access, input, correlationId);
  }

  updateBranch(
    access: AccessContext,
    id: string,
    input: UpdateBranchDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.branchAdmin.updateBranch(access, id, input, expectedVersion, correlationId);
  }

  listRoles(access: AccessContext, input: ListAdministrationDto) {
    return this.roleAdmin.listRoles(access, input);
  }

  readRole(access: AccessContext, id: string) {
    return this.roleAdmin.readRole(access, id);
  }

  createRole(access: AccessContext, input: CreateRoleDto, correlationId: string) {
    return this.roleAdmin.createRole(access, input, correlationId);
  }

  updateRole(
    access: AccessContext,
    id: string,
    input: UpdateRoleDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.roleAdmin.updateRole(access, id, input, expectedVersion, correlationId);
  }

  replaceRoleGrants(
    access: AccessContext,
    id: string,
    input: ReplaceRoleGrantsDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.roleAdmin.replaceRoleGrants(access, id, input, expectedVersion, correlationId);
  }

  listUsers(access: AccessContext, input: ListUsersDto) {
    return this.userRead.listUsers(access, input);
  }

  readUser(access: AccessContext, id: string) {
    return this.userRead.readUser(access, id);
  }

  createUser(access: AccessContext, input: CreateUserDto, correlationId: string) {
    return this.userLifecycle.createUser(access, input, correlationId);
  }

  updateUserStatus(
    access: AccessContext,
    id: string,
    input: UpdateUserStatusDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.userLifecycle.updateUserStatus(access, id, input, expectedVersion, correlationId);
  }

  replaceUserRoles(
    access: AccessContext,
    id: string,
    input: ReplaceAssignmentsDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.userAssignment.replaceUserRoles(access, id, input, expectedVersion, correlationId);
  }

  replaceUserBranches(
    access: AccessContext,
    id: string,
    input: ReplaceAssignmentsDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.userAssignment.replaceUserBranches(
      access,
      id,
      input,
      expectedVersion,
      correlationId,
    );
  }
}
