import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { PrismaService } from '../../platform/database/prisma.service';
import { AuditService } from '../../platform/audit/audit.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { LeadAccessService } from './lead-access.service';
import { LeadPersonService } from './lead-person.service';
import { LeadStageService } from './lead-stage.service';
import { notFound, versionConflict } from './leads.errors';
import type { CreateLeadActivityDto, CreateLeadDto, UpdateLeadDto } from './leads.dto';

@Injectable()
export class LeadsCommandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly access: LeadAccessService,
    private readonly person: LeadPersonService,
    private readonly stage: LeadStageService,
  ) {}

  async create(access: AccessContext, input: CreateLeadDto, correlationId: string) {
    this.access.assertBranchScope(access, input.branchId, 'leads.create');
    return this.prisma.$transaction(async (transaction) => {
      const branch = await transaction.branch.findFirst({
        where: { organizationId: access.organizationId, id: input.branchId, isActive: true },
      });
      if (!branch) throw notFound();
      const personId = await this.person.resolveLeadPerson(
        transaction,
        access.organizationId,
        input,
      );
      if (input.stageId)
        await this.stage.validateStage(transaction, access.organizationId, input.stageId);
      const createScopes = access.grants.get('leads.create');
      const assignedUserId =
        createScopes?.has('A') && !createScopes.has('O') && !createScopes.has('B')
          ? access.actorUserId
          : (input.assignedUserId ?? null);
      if (assignedUserId) {
        await this.access.validateAssignee(
          transaction,
          access.organizationId,
          branch.id,
          assignedUserId,
        );
      }
      const lead = await transaction.lead.create({
        data: {
          organizationId: access.organizationId,
          branchId: branch.id,
          assignedUserId,
          personId,
          stageId: input.stageId ?? null,
          source: input.source?.trim() ?? null,
          nextActionAt: input.nextActionAt ? new Date(input.nextActionAt) : null,
        },
      });
      await transaction.leadStatusHistory.create({
        data: {
          organizationId: access.organizationId,
          leadId: lead.id,
          toState: 'NEW',
          actorUserId: access.actorUserId,
        },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'lead.create',
        entityType: 'Lead',
        entityId: lead.id,
        correlationId,
        after: {
          branchId: lead.branchId,
          assignedUserId: lead.assignedUserId,
          personId: lead.personId,
        },
      });
      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'Lead',
        aggregateId: lead.id,
        type: 'lead.created',
        payload: { leadId: lead.id, branchId: lead.branchId },
      });
      return lead;
    });
  }

  async update(
    access: AccessContext,
    leadId: string,
    input: UpdateLeadDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const lead = await transaction.lead.findFirst({
        where: { id: leadId, organizationId: access.organizationId },
      });
      if (!lead) throw notFound();
      this.access.assertLeadScope(access, lead, 'leads.update');
      if (input.stageId)
        await this.stage.validateStage(transaction, access.organizationId, input.stageId);
      const changed = await transaction.lead.updateMany({
        where: { id: lead.id, organizationId: access.organizationId, version: expectedVersion },
        data: {
          ...(input.stageId === undefined ? {} : { stageId: input.stageId }),
          ...(input.source === undefined ? {} : { source: input.source.trim() }),
          ...(input.nextActionAt === undefined
            ? {}
            : { nextActionAt: new Date(input.nextActionAt) }),
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw versionConflict();
      const updated = await transaction.lead.findUniqueOrThrow({ where: { id: lead.id } });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'lead.update',
        entityType: 'Lead',
        entityId: lead.id,
        correlationId,
        before: { stageId: lead.stageId, nextActionAt: lead.nextActionAt, version: lead.version },
        after: {
          stageId: updated.stageId,
          nextActionAt: updated.nextActionAt,
          version: updated.version,
        },
      });
      return updated;
    });
  }

  async assign(
    access: AccessContext,
    leadId: string,
    targetUserId: string,
    permission: 'leads.claim' | 'leads.assign',
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.prisma.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM leads WHERE id = ${leadId}::uuid AND organization_id = ${access.organizationId}::uuid FOR UPDATE`;
      const lead = await transaction.lead.findFirst({
        where: { id: leadId, organizationId: access.organizationId },
      });
      if (!lead) throw notFound();
      this.access.assertLeadScope(access, lead, permission);
      if (lead.version !== expectedVersion) throw versionConflict();
      if (
        permission === 'leads.claim' &&
        lead.assignedUserId &&
        lead.assignedUserId !== access.actorUserId
      )
        throw new ConflictException({
          code: 'LEAD_ALREADY_ASSIGNED',
          messageKey: 'leads.alreadyAssigned',
        });
      await this.access.validateAssignee(
        transaction,
        access.organizationId,
        lead.branchId,
        targetUserId,
      );
      const updated = await transaction.lead.update({
        where: { id: lead.id },
        data: { assignedUserId: targetUserId, version: { increment: 1 } },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: permission === 'leads.claim' ? 'lead.claim' : 'lead.assign',
        entityType: 'Lead',
        entityId: lead.id,
        correlationId,
        before: { assignedUserId: lead.assignedUserId, version: lead.version },
        after: { assignedUserId: updated.assignedUserId, version: updated.version },
      });
      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'Lead',
        aggregateId: lead.id,
        type: 'lead.assigned',
        payload: { leadId: lead.id, assignedUserId: targetUserId },
      });
      return updated;
    });
  }

  async addActivity(
    access: AccessContext,
    leadId: string,
    input: CreateLeadActivityDto,
    correlationId: string,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const lead = await transaction.lead.findFirst({
        where: { id: leadId, organizationId: access.organizationId },
      });
      if (!lead) throw notFound();
      this.access.assertLeadScope(access, lead, 'leads.update');
      const activity = await transaction.leadActivity.create({
        data: {
          organizationId: access.organizationId,
          leadId: lead.id,
          actorUserId: access.actorUserId,
          type: input.type,
          occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
          ...(input.data ? { data: input.data as Prisma.InputJsonValue } : {}),
        },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'lead.activity.create',
        entityType: 'LeadActivity',
        entityId: activity.id,
        correlationId,
        after: { leadId: lead.id, type: activity.type, occurredAt: activity.occurredAt },
      });
      return activity;
    });
  }
}
