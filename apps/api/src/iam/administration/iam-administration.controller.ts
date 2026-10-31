import { Body, Controller, Get, Headers, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AccessContext } from '@academyops/contracts';
import { requireVersion } from '../../common/http/headers';
import { CurrentAccess, RequirePermission } from '../authorization/decorators';
import {
  BranchDto,
  BranchesPageDto,
  ReplaceGrantsResponseDto,
  RoleDto,
  RolesPageDto,
  RoleWithGrantsDto,
  UserSummaryDto,
  UsersPageDto,
} from './iam-administration-response.dto';
import {
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
import { IamAdministrationService } from './iam-administration.service';

@ApiTags('branches')
@Controller({ path: 'branches', version: '1' })
export class BranchesController {
  constructor(private readonly administration: IamAdministrationService) {}

  @RequirePermission('branches.manage')
  @Get()
  @ApiOkResponse({ type: BranchesPageDto })
  list(@CurrentAccess() access: AccessContext, @Query() query: ListAdministrationDto) {
    return this.administration.listBranches(access, query);
  }

  @RequirePermission('branches.manage')
  @Get(':id')
  @ApiOkResponse({ type: BranchDto })
  read(@CurrentAccess() access: AccessContext, @Param('id') id: string) {
    return this.administration.readBranch(access, id);
  }

  @RequirePermission('branches.manage')
  @Post()
  @ApiCreatedResponse({ type: BranchDto })
  create(
    @CurrentAccess() access: AccessContext,
    @Body() input: CreateBranchDto,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.administration.createBranch(access, input, correlationId);
  }

  @RequirePermission('branches.manage')
  @Patch(':id')
  @ApiOkResponse({ type: BranchDto })
  update(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: UpdateBranchDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.administration.updateBranch(
      access,
      id,
      input,
      requireVersion(ifMatch),
      correlationId,
    );
  }
}

@ApiTags('roles')
@Controller({ path: 'roles', version: '1' })
export class RolesController {
  constructor(private readonly administration: IamAdministrationService) {}

  @RequirePermission('roles.manage')
  @Get()
  @ApiOkResponse({ type: RolesPageDto })
  list(@CurrentAccess() access: AccessContext, @Query() query: ListAdministrationDto) {
    return this.administration.listRoles(access, query);
  }

  @RequirePermission('roles.manage')
  @Get(':id')
  @ApiOkResponse({ type: RoleWithGrantsDto })
  read(@CurrentAccess() access: AccessContext, @Param('id') id: string) {
    return this.administration.readRole(access, id);
  }

  @RequirePermission('roles.manage')
  @Post()
  @ApiCreatedResponse({ type: RoleWithGrantsDto })
  create(
    @CurrentAccess() access: AccessContext,
    @Body() input: CreateRoleDto,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.administration.createRole(access, input, correlationId);
  }

  @RequirePermission('roles.manage')
  @Patch(':id')
  @ApiOkResponse({ type: RoleDto })
  update(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: UpdateRoleDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.administration.updateRole(
      access,
      id,
      input,
      requireVersion(ifMatch),
      correlationId,
    );
  }

  @RequirePermission('roles.manage')
  @Put(':id/grants')
  @ApiOkResponse({ type: ReplaceGrantsResponseDto })
  replaceGrants(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: ReplaceRoleGrantsDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.administration.replaceRoleGrants(
      access,
      id,
      input,
      requireVersion(ifMatch),
      correlationId,
    );
  }
}

@ApiTags('users')
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly administration: IamAdministrationService) {}

  @RequirePermission('users.manage')
  @Get()
  @ApiOkResponse({ type: UsersPageDto })
  list(@CurrentAccess() access: AccessContext, @Query() query: ListUsersDto) {
    return this.administration.listUsers(access, query);
  }

  @RequirePermission('users.manage')
  @Get(':id')
  @ApiOkResponse({ type: UserSummaryDto })
  read(@CurrentAccess() access: AccessContext, @Param('id') id: string) {
    return this.administration.readUser(access, id);
  }

  @RequirePermission('users.manage')
  @Post()
  @ApiCreatedResponse({ type: UserSummaryDto })
  create(
    @CurrentAccess() access: AccessContext,
    @Body() input: CreateUserDto,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.administration.createUser(access, input, correlationId);
  }

  @RequirePermission('users.manage')
  @Patch(':id/status')
  @ApiOkResponse({ type: UserSummaryDto })
  updateStatus(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: UpdateUserStatusDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.administration.updateUserStatus(
      access,
      id,
      input,
      requireVersion(ifMatch),
      correlationId,
    );
  }

  @RequirePermission('users.manage')
  @Put(':id/roles')
  @ApiOkResponse({ type: UserSummaryDto })
  replaceRoles(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: ReplaceAssignmentsDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.administration.replaceUserRoles(
      access,
      id,
      input,
      requireVersion(ifMatch),
      correlationId,
    );
  }

  @RequirePermission('users.manage')
  @Put(':id/branches')
  @ApiOkResponse({ type: UserSummaryDto })
  replaceBranches(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: ReplaceAssignmentsDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.administration.replaceUserBranches(
      access,
      id,
      input,
      requireVersion(ifMatch),
      correlationId,
    );
  }
}
