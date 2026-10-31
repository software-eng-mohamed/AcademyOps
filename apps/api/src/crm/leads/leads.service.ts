import { Injectable } from '@nestjs/common';
import type { AccessContext, LeadCommand, LeadState } from '@academyops/contracts';
import { LeadsQueryService } from './leads-query.service';
import { LeadsCommandService } from './leads-command.service';
import { LeadTransitionService } from './lead-transition.service';
import { LeadConversionService } from './lead-conversion.service';
import { LeadStageService } from './lead-stage.service';
import { LeadAccessService } from './lead-access.service';
import type {
  CreateLeadActivityDto,
  CreateLeadDto,
  CreateLeadStageDto,
  ListLeadsDto,
  ListLeadAssigneesDto,
  UpdateLeadDto,
  UpdateLeadStageDto,
  WinLeadDto,
} from './leads.dto';

type MutationMeta = { correlationId: string; expectedVersion: number };
type WinMutationMeta = MutationMeta & { idempotencyKey: string };
type WinResult = { leadId: string; personId: string; enrollmentId: string; version: number };

@Injectable()
export class LeadsService {
  constructor(
    private readonly queryService: LeadsQueryService,
    private readonly commandService: LeadsCommandService,
    private readonly transitionService: LeadTransitionService,
    private readonly conversionService: LeadConversionService,
    private readonly stageService: LeadStageService,
    private readonly accessService: LeadAccessService,
  ) {}

  async list(access: AccessContext, input: ListLeadsDto) {
    return this.queryService.list(access, input);
  }

  listAssignees(access: AccessContext, input: ListLeadAssigneesDto) {
    return this.accessService.listAssignees(access, input.branchId, input.search, input.limit);
  }

  async read(access: AccessContext, leadId: string) {
    return this.queryService.read(access, leadId);
  }

  async create(access: AccessContext, input: CreateLeadDto, correlationId: string) {
    return this.commandService.create(access, input, correlationId);
  }

  async update(
    access: AccessContext,
    leadId: string,
    input: UpdateLeadDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.commandService.update(access, leadId, input, expectedVersion, correlationId);
  }

  async assign(
    access: AccessContext,
    leadId: string,
    targetUserId: string,
    permission: 'leads.claim' | 'leads.assign',
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.commandService.assign(
      access,
      leadId,
      targetUserId,
      permission,
      expectedVersion,
      correlationId,
    );
  }

  async addActivity(
    access: AccessContext,
    leadId: string,
    input: CreateLeadActivityDto,
    correlationId: string,
  ) {
    return this.commandService.addActivity(access, leadId, input, correlationId);
  }

  async transition(
    access: AccessContext,
    leadId: string,
    command: Exclude<LeadCommand, 'win'>,
    reason: string | undefined,
    meta: MutationMeta,
  ): Promise<{ id: string; state: LeadState; version: number }> {
    return this.transitionService.transition(access, leadId, command, reason, meta);
  }

  async win(
    access: AccessContext,
    leadId: string,
    input: WinLeadDto,
    meta: WinMutationMeta,
  ): Promise<WinResult> {
    return this.conversionService.win(access, leadId, input, meta);
  }

  async listStages(access: AccessContext, includeInactive: boolean) {
    return this.stageService.listStages(access, includeInactive);
  }

  async createStage(access: AccessContext, input: CreateLeadStageDto, correlationId: string) {
    return this.stageService.createStage(access, input, correlationId);
  }

  async updateStage(
    access: AccessContext,
    id: string,
    input: UpdateLeadStageDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.stageService.updateStage(access, id, input, expectedVersion, correlationId);
  }
}
