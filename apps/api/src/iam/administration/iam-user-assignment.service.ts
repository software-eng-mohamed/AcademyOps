import { Injectable } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { AuditService } from '../../platform/audit/audit.service';
import { PrismaService } from '../../platform/database/prisma.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import type { ReplaceAssignmentsDto } from './iam-administration.dto';
import { conflict, notFound, revokeSessions, versionConflict } from './iam-administration.utils';
import { IamUserReadService } from './iam-user-read.service';
import { iamRealtimeEvents } from './iam-realtime-events';
import { assertOwnerContinuity } from './last-owner-policy';
import { assertBranchDelegation, assertGrantDelegation } from './iam-delegation-policy';

@Injectable()
export class IamUserAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly userRead: IamUserReadService,
  ) {}

  async replaceUserRoles(
    access: AccessContext,
    id: string,
    input: ReplaceAssignmentsDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    await this.prisma.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid AND organization_id = ${access.organizationId}::uuid FOR UPDATE`;
      const user = await transaction.user.findFirst({
        where: { id, organizationId: access.organizationId },
      });
      if (!user) throw notFound('USER_NOT_FOUND', 'users.notFound');
      if (user.version !== expectedVersion) throw versionConflict();
      const roles = await transaction.role.findMany({
        where: { organizationId: access.organizationId, id: { in: input.ids } },
      });
      if (roles.length !== input.ids.length)
        throw conflict('ROLE_SELECTION_INVALID', 'roles.selectionInvalid');
      const current = await transaction.userRoleAssignment.findMany({
        where: {
          organizationId: access.organizationId,
          userId: user.id,
          startsAt: { lte: new Date() },
          OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
        },
      });
      const roleGrants = await transaction.rolePermissionGrant.findMany({
        where: {
          organizationId: access.organizationId,
          roleId: {
            in: [
              ...new Set([
                ...roles.map(({ id: roleId }) => roleId),
                ...current.map(({ roleId }) => roleId),
              ]),
            ],
          },
        },
        select: { permissionCode: true, scope: true },
      });
      assertGrantDelegation(access, roleGrants);
      const desired = new Set(input.ids);
      const currentIds = new Set(current.map(({ roleId }) => roleId));
      const ownerRole = roles.find(({ code }) => code === 'OWNER');
      const currentOwnerRole = await transaction.role.findFirst({
        where: {
          organizationId: access.organizationId,
          code: 'OWNER',
          id: { in: [...currentIds] },
        },
        select: { id: true },
      });
      if (currentOwnerRole && !ownerRole) {
        await assertOwnerContinuity(transaction, access.organizationId, user.id);
      }
      const removed = current.filter(({ roleId }) => !desired.has(roleId));
      if (removed.length) {
        await transaction.userRoleAssignment.updateMany({
          where: { id: { in: removed.map(({ id: assignmentId }) => assignmentId) } },
          data: { endsAt: new Date() },
        });
      }
      const added = roles.filter(({ id: roleId }) => !currentIds.has(roleId));
      if (added.length) {
        await transaction.userRoleAssignment.createMany({
          data: added.map((role) => ({
            organizationId: access.organizationId,
            userId: user.id,
            roleId: role.id,
          })),
        });
      }
      await transaction.user.update({
        where: { id: user.id },
        data: { version: { increment: 1 } },
      });
      await revokeSessions(transaction, access.organizationId, [user.id]);
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'user.roles.replace',
        entityType: 'User',
        entityId: user.id,
        correlationId,
        before: { roleIds: [...currentIds] },
        after: { roleIds: input.ids },
        metadata: { reason: input.reason },
      });
      await this.outbox.add(
        transaction,
        iamRealtimeEvents.userRolesReplaced({
          organizationId: access.organizationId,
          id: user.id,
        }),
      );
    });
    return this.userRead.buildUserSummary(access.organizationId, id);
  }

  async replaceUserBranches(
    access: AccessContext,
    id: string,
    input: ReplaceAssignmentsDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    await this.prisma.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid AND organization_id = ${access.organizationId}::uuid FOR UPDATE`;
      const user = await transaction.user.findFirst({
        where: { id, organizationId: access.organizationId },
      });
      if (!user) throw notFound('USER_NOT_FOUND', 'users.notFound');
      if (user.version !== expectedVersion) throw versionConflict();
      const branches = await transaction.branch.findMany({
        where: {
          organizationId: access.organizationId,
          id: { in: input.ids },
          isActive: true,
        },
      });
      if (branches.length !== input.ids.length)
        throw conflict('BRANCH_SELECTION_INVALID', 'branches.selectionInvalid');
      assertBranchDelegation(
        access,
        branches.map(({ id }) => id),
      );
      const staff = await transaction.staffProfile.findFirst({
        where: { organizationId: access.organizationId, personId: user.personId },
      });
      if (!staff) throw conflict('STAFF_PROFILE_REQUIRED', 'users.staffProfileRequired');
      const current = await transaction.staffBranchAssignment.findMany({
        where: {
          organizationId: access.organizationId,
          staffProfileId: staff.id,
          endsAt: null,
        },
      });
      const desired = new Set(input.ids);
      const currentIds = new Set(current.map(({ branchId }) => branchId));
      const removed = current.filter(({ branchId }) => !desired.has(branchId));
      if (removed.length) {
        await transaction.staffBranchAssignment.updateMany({
          where: { id: { in: removed.map(({ id: assignmentId }) => assignmentId) } },
          data: { endsAt: new Date() },
        });
      }
      const added = branches.filter(({ id: branchId }) => !currentIds.has(branchId));
      if (added.length) {
        await transaction.staffBranchAssignment.createMany({
          data: added.map((branch) => ({
            organizationId: access.organizationId,
            staffProfileId: staff.id,
            branchId: branch.id,
          })),
        });
      }
      await transaction.user.update({
        where: { id: user.id },
        data: { version: { increment: 1 } },
      });
      await revokeSessions(transaction, access.organizationId, [user.id]);
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'user.branches.replace',
        entityType: 'User',
        entityId: user.id,
        correlationId,
        before: { branchIds: [...currentIds] },
        after: { branchIds: input.ids },
        metadata: { reason: input.reason },
      });
      await this.outbox.add(
        transaction,
        iamRealtimeEvents.userBranchesReplaced({
          organizationId: access.organizationId,
          id: user.id,
        }),
      );
    });
    return this.userRead.buildUserSummary(access.organizationId, id);
  }
}
