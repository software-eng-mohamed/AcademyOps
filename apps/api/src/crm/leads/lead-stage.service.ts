import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { PrismaService } from '../../platform/database/prisma.service';
import type { CreateLeadStageDto, UpdateLeadStageDto } from './leads.dto';
import { LeadAccessService } from './lead-access.service';
import { stageConflict, versionConflict } from './leads.errors';
import { AuditService } from '../../platform/audit/audit.service';
type Transaction = Prisma.TransactionClient;
@Injectable()
export class LeadStageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: LeadAccessService,
    private readonly audit: AuditService,
  ) {}
  async listStages(access: AccessContext, includeInactive: boolean) {
    const canManageOrganization = access.grants.get('leads.assign')?.has('O') ?? false;
    return this.prisma.leadStage.findMany({
      where: {
        organizationId: access.organizationId,
        ...(includeInactive && canManageOrganization ? {} : { isActive: true }),
      },
      orderBy: [{ ordinal: 'asc' }, { id: 'asc' }],
    });
  }
  async createStage(access: AccessContext, input: CreateLeadStageDto, correlationId: string) {
    this.access.assertStageManagement(access);
    return this.prisma.$transaction(async (transaction) => {
      const duplicate = await transaction.leadStage.findFirst({
        where: {
          organizationId: access.organizationId,
          OR: [{ code: input.code.trim().toUpperCase() }, { ordinal: input.ordinal }],
        },
      });
      if (duplicate) throw stageConflict();
      const stage = await transaction.leadStage.create({
        data: {
          organizationId: access.organizationId,
          code: input.code.trim().toUpperCase(),
          name: input.name.trim(),
          ordinal: input.ordinal,
        },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'lead_stage.create',
        entityType: 'LeadStage',
        entityId: stage.id,
        correlationId,
        after: { code: stage.code, ordinal: stage.ordinal },
      });
      return stage;
    });
  }
  async updateStage(
    access: AccessContext,
    id: string,
    input: UpdateLeadStageDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    this.access.assertStageManagement(access);
    return this.prisma.$transaction(async (transaction) => {
      const stage = await transaction.leadStage.findFirst({
        where: { organizationId: access.organizationId, id },
      });
      if (!stage)
        throw new NotFoundException({
          code: 'LEAD_STAGE_NOT_FOUND',
          messageKey: 'leads.stageNotFound',
        });
      if (input.ordinal !== undefined) {
        const duplicate = await transaction.leadStage.findFirst({
          where: {
            organizationId: access.organizationId,
            ordinal: input.ordinal,
            id: { not: id },
          },
        });
        if (duplicate) throw stageConflict();
      }
      const changed = await transaction.leadStage.updateMany({
        where: { organizationId: access.organizationId, id, version: expectedVersion },
        data: {
          ...(input.name === undefined ? {} : { name: input.name.trim() }),
          ...(input.ordinal === undefined ? {} : { ordinal: input.ordinal }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw versionConflict();
      const updated = await transaction.leadStage.findUniqueOrThrow({ where: { id } });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'lead_stage.update',
        entityType: 'LeadStage',
        entityId: id,
        correlationId,
        before: { ordinal: stage.ordinal, isActive: stage.isActive, version: stage.version },
        after: { ordinal: updated.ordinal, isActive: updated.isActive, version: updated.version },
      });
      return updated;
    });
  }
  async validateStage(transaction: Transaction, organizationId: string, stageId: string) {
    const stage = await transaction.leadStage.findFirst({
      where: { organizationId, id: stageId, isActive: true },
    });
    if (!stage)
      throw new NotFoundException({
        code: 'LEAD_STAGE_NOT_FOUND',
        messageKey: 'leads.stageNotFound',
      });
  }
}
