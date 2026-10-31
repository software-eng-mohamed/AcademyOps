import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import { workspaceOverviewRoles } from '@academyops/contracts';
import type { AccessContext, WorkspaceOverviewRole } from '@academyops/contracts';
import { IsIn } from 'class-validator';
import { CurrentAccess } from '../iam/authorization/decorators';
import { WorkspaceOverviewService } from './workspace-overview.service';

class WorkspaceParams {
  @IsIn(workspaceOverviewRoles)
  role!: WorkspaceOverviewRole;
}

@ApiTags('dashboard')
@Controller({ path: 'dashboard/workspaces', version: '1' })
export class WorkspaceOverviewController {
  constructor(private readonly workspaces: WorkspaceOverviewService) {}

  // The session guard authenticates; the service checks the full per-workspace
  // permission AND scope matrix before making any data request.
  @Get(':role')
  @Header('Cache-Control', 'private, no-store')
  @ApiParam({ name: 'role', enum: workspaceOverviewRoles })
  overview(@CurrentAccess() access: AccessContext, @Param() params: WorkspaceParams) {
    return this.workspaces.overview(access, params.role);
  }
}
