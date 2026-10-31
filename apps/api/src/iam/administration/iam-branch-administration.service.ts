import { Injectable } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { AuditService } from '../../platform/audit/audit.service';
import { PrismaService } from '../../platform/database/prisma.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import type {
  CreateBranchDto,
  ListAdministrationDto,
  UpdateBranchDto,
} from './iam-administration.dto';
import { conflict, notFound, page, versionConflict } from './iam-administration.utils';
import { iamRealtimeEvents } from './iam-realtime-events';
@Injectable()
export class IamBranchAdministrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}
  async listBranches(access: AccessContext, input: ListAdministrationDto) {
    const branches = await this.prisma.branch.findMany({
      where: {
        organizationId: access.organizationId,
        ...(input.search
          ? {
              OR: [
                { code: { contains: input.search, mode: 'insensitive' as const } },
                { name: { contains: input.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: { id: 'asc' },
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });
    return page(branches, input.limit);
  }
  async readBranch(access: AccessContext, id: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, organizationId: access.organizationId },
    });
    if (!branch) throw notFound('BRANCH_NOT_FOUND', 'branches.notFound');
    return branch;
  }
  async createBranch(access: AccessContext, input: CreateBranchDto, correlationId: string) {
    const code = input.code.trim().toUpperCase();
    const duplicate = await this.prisma.branch.findFirst({
      where: { organizationId: access.organizationId, code },
      select: { id: true },
    });
    if (duplicate) throw conflict('BRANCH_CODE_EXISTS', 'branches.codeExists');
    return this.prisma.$transaction(async (transaction) => {
      const branch = await transaction.branch.create({
        data: {
          organizationId: access.organizationId,
          code,
          name: input.name.trim(),
        },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'branch.create',
        entityType: 'Branch',
        entityId: branch.id,
        correlationId,
        after: { code: branch.code, name: branch.name },
      });
      await this.outbox.add(
        transaction,
        iamRealtimeEvents.branchCreated({
          organizationId: access.organizationId,
          id: branch.id,
        }),
      );
      return branch;
    });
  }
  async updateBranch(
    access: AccessContext,
    id: string,
    input: UpdateBranchDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const branch = await transaction.branch.findFirst({
        where: { id, organizationId: access.organizationId },
      });
      if (!branch) throw notFound('BRANCH_NOT_FOUND', 'branches.notFound');
      if (branch.version !== expectedVersion) throw versionConflict();
      const updated = await transaction.branch.update({
        where: { id: branch.id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name.trim() }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
          version: { increment: 1 },
        },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'branch.update',
        entityType: 'Branch',
        entityId: branch.id,
        correlationId,
        before: { name: branch.name, isActive: branch.isActive },
        after: { name: updated.name, isActive: updated.isActive },
      });
      await this.outbox.add(
        transaction,
        iamRealtimeEvents.branchUpdated({
          organizationId: access.organizationId,
          id: branch.id,
        }),
      );
      return updated;
    });
  }
}
