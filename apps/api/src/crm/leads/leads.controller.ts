import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AccessContext, LeadState } from '@academyops/contracts';
import { requireIdempotencyKey, requireVersion } from '../../common/http/headers';
import { CurrentAccess, RequirePermission } from '../../iam/authorization/decorators';
import {
  AssignLeadDto,
  CreateLeadActivityDto,
  CreateLeadDto,
  CreateLeadStageDto,
  LeadReasonDto,
  ListLeadsDto,
  ListLeadAssigneesDto,
  ListLeadStagesDto,
  UpdateLeadDto,
  UpdateLeadStageDto,
  WinLeadDto,
} from './leads.dto';
import { LeadsService } from './leads.service';

@ApiTags('crm')
@Controller({ path: 'leads', version: '1' })
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @RequirePermission('leads.read')
  @Get()
  list(@CurrentAccess() access: AccessContext, @Query() query: ListLeadsDto) {
    return this.leads.list(access, query);
  }

  @RequirePermission('leads.assign')
  @Get('assignees')
  assignees(@CurrentAccess() access: AccessContext, @Query() query: ListLeadAssigneesDto) {
    return this.leads.listAssignees(access, query);
  }

  @RequirePermission('leads.read')
  @Get(':id')
  read(@CurrentAccess() access: AccessContext, @Param('id') id: string) {
    return this.leads.read(access, id);
  }

  @RequirePermission('leads.create')
  @Post()
  create(
    @CurrentAccess() access: AccessContext,
    @Body() input: CreateLeadDto,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.leads.create(access, input, correlationId);
  }

  @RequirePermission('leads.update')
  @Patch(':id')
  update(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: UpdateLeadDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.leads.update(access, id, input, requireVersion(ifMatch), correlationId);
  }

  @RequirePermission('leads.claim')
  @Post(':id/claim')
  claim(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.leads.assign(
      access,
      id,
      access.actorUserId,
      'leads.claim',
      requireVersion(ifMatch),
      correlationId,
    );
  }

  @RequirePermission('leads.assign')
  @Post(':id/assign')
  assign(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: AssignLeadDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.leads.assign(
      access,
      id,
      input.userId,
      'leads.assign',
      requireVersion(ifMatch),
      correlationId,
    );
  }

  @RequirePermission('leads.update')
  @Post(':id/activities')
  addActivity(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: CreateLeadActivityDto,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.leads.addActivity(access, id, input, correlationId);
  }

  @RequirePermission('leads.update')
  @Post(':id/open')
  open(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ): Promise<{ id: string; state: LeadState; version: number }> {
    return this.leads.transition(access, id, 'open', undefined, {
      expectedVersion: requireVersion(ifMatch),
      correlationId,
    });
  }

  @RequirePermission('leads.update')
  @Post(':id/qualify')
  qualify(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ): Promise<{ id: string; state: LeadState; version: number }> {
    return this.leads.transition(access, id, 'qualify', undefined, {
      expectedVersion: requireVersion(ifMatch),
      correlationId,
    });
  }

  @RequirePermission('leads.update')
  @Post(':id/lose')
  lose(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: LeadReasonDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ): Promise<{ id: string; state: LeadState; version: number }> {
    return this.leads.transition(access, id, 'lose', input.reason, {
      expectedVersion: requireVersion(ifMatch),
      correlationId,
    });
  }

  @RequirePermission('leads.update')
  @Post(':id/disqualify')
  disqualify(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: LeadReasonDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ): Promise<{ id: string; state: LeadState; version: number }> {
    return this.leads.transition(access, id, 'disqualify', input.reason, {
      expectedVersion: requireVersion(ifMatch),
      correlationId,
    });
  }

  @RequirePermission('leads.update')
  @Post(':id/reopen')
  reopen(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: LeadReasonDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ): Promise<{ id: string; state: LeadState; version: number }> {
    return this.leads.transition(access, id, 'reopen', input.reason, {
      expectedVersion: requireVersion(ifMatch),
      correlationId,
    });
  }

  @RequirePermission('leads.convert')
  @Post(':id/win')
  win(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: WinLeadDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ): Promise<{ leadId: string; personId: string; enrollmentId: string; version: number }> {
    return this.leads.win(access, id, input, {
      expectedVersion: requireVersion(ifMatch),
      idempotencyKey: requireIdempotencyKey(idempotencyKey),
      correlationId,
    });
  }
}

@ApiTags('crm')
@Controller({ path: 'lead-stages', version: '1' })
export class LeadStagesController {
  constructor(private readonly leads: LeadsService) {}

  @RequirePermission('leads.read')
  @Get()
  list(@CurrentAccess() access: AccessContext, @Query() query: ListLeadStagesDto) {
    return this.leads.listStages(access, query.includeInactive);
  }

  @RequirePermission('leads.assign')
  @Post()
  create(
    @CurrentAccess() access: AccessContext,
    @Body() input: CreateLeadStageDto,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.leads.createStage(access, input, correlationId);
  }

  @RequirePermission('leads.assign')
  @Patch(':id')
  update(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: UpdateLeadStageDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.leads.updateStage(access, id, input, requireVersion(ifMatch), correlationId);
  }
}
