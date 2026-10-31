import { Injectable } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { AuditService } from '../../platform/audit/audit.service';
import { PrismaService } from '../../platform/database/prisma.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import type {
  CreateRoleDto,
  ListAdministrationDto,
  ReplaceRoleGrantsDto,
  UpdateRoleDto,
} from './iam-administration.dto';
import { conflict, notFound, revokeSessions, versionConflict } from './iam-administration.utils';
import type { Transaction } from './iam-administration.utils';
import { validateAndDeDuplicateGrants } from './role-grant-policy';
import { iamRealtimeEvents } from './iam-realtime-events';
import { assertGrantDelegation } from './iam-delegation-policy';

@Injectable()
export class IamRoleAdministrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async listRoles(access: AccessContext, input: ListAdministrationDto) {
    const roles = await this.prisma.role.findMany({
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
    const visible = roles.slice(0, input.limit);
    const grants = await this.prisma.rolePermissionGrant.findMany({
      where: { organizationId: access.organizationId, roleId: { in: visible.map(({ id }) => id) } },
      orderBy: [{ permissionCode: 'asc' }, { scope: 'asc' }],
    });
    return {
      items: visible.map((role) => ({
        ...role,
        grants: grants
          .filter((grant) => grant.roleId === role.id)
          .map(({ permissionCode, scope }) => ({ permissionCode, scope })),
      })),
      nextCursor: roles.length > input.limit ? (visible.at(-1)?.id ?? null) : null,
    };
  }

  async readRole(access: AccessContext, id: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, organizationId: access.organizationId },
    });
    if (!role) throw notFound('ROLE_NOT_FOUND', 'roles.notFound');
    const grants = await this.prisma.rolePermissionGrant.findMany({
      where: { organizationId: access.organizationId, roleId: role.id },
      orderBy: [{ permissionCode: 'asc' }, { scope: 'asc' }],
    });
    return {
      ...role,
      grants: grants.map(({ permissionCode, scope }) => ({ permissionCode, scope })),
    };
  }

  async createRole(access: AccessContext, input: CreateRoleDto, correlationId: string) {
    const grants = validateAndDeDuplicateGrants(input.grants, access);
    const code = input.code.trim().toUpperCase();
    const duplicate = await this.prisma.role.findFirst({
      where: { organizationId: access.organizationId, code },
      select: { id: true },
    });
    if (duplicate) throw conflict('ROLE_CODE_EXISTS', 'roles.codeExists');
    return this.prisma.$transaction(async (transaction) => {
      const role = await transaction.role.create({
        data: {
          organizationId: access.organizationId,
          code,
          name: input.name.trim(),
        },
      });
      if (grants.length) {
        await transaction.rolePermissionGrant.createMany({
          data: grants.map((grant) => ({
            organizationId: access.organizationId,
            roleId: role.id,
            permissionCode: grant.permissionCode,
            scope: grant.scope,
          })),
        });
      }
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'role.create',
        entityType: 'Role',
        entityId: role.id,
        correlationId,
        after: {
          code: role.code,
          grants: grants.map(({ permissionCode, scope }) => ({ permissionCode, scope })),
        },
      });
      await this.outbox.add(
        transaction,
        iamRealtimeEvents.roleCreated({ organizationId: access.organizationId, id: role.id }),
      );
      return { ...role, grants };
    });
  }

  async updateRole(
    access: AccessContext,
    id: string,
    input: UpdateRoleDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const role = await this.requireCustomRole(transaction, access.organizationId, id);
      if (role.version !== expectedVersion) throw versionConflict();
      const grants = await transaction.rolePermissionGrant.findMany({
        where: { organizationId: access.organizationId, roleId: role.id },
        select: { permissionCode: true, scope: true },
      });
      assertGrantDelegation(access, grants);
      const updated = await transaction.role.update({
        where: { id: role.id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name.trim() }),
          version: { increment: 1 },
        },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'role.update',
        entityType: 'Role',
        entityId: role.id,
        correlationId,
        before: { name: role.name },
        after: { name: updated.name },
      });
      await this.outbox.add(
        transaction,
        iamRealtimeEvents.roleUpdated({ organizationId: access.organizationId, id: role.id }),
      );
      return updated;
    });
  }

  async replaceRoleGrants(
    access: AccessContext,
    id: string,
    input: ReplaceRoleGrantsDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    const grants = validateAndDeDuplicateGrants(input.grants, access);
    return this.prisma.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM roles WHERE id = ${id}::uuid AND organization_id = ${access.organizationId}::uuid FOR UPDATE`;
      const role = await this.requireCustomRole(transaction, access.organizationId, id);
      if (role.version !== expectedVersion) throw versionConflict();
      const before = await transaction.rolePermissionGrant.findMany({
        where: { organizationId: access.organizationId, roleId: role.id },
        select: { permissionCode: true, scope: true },
      });
      assertGrantDelegation(access, before);
      await transaction.rolePermissionGrant.deleteMany({
        where: { organizationId: access.organizationId, roleId: role.id },
      });
      if (grants.length) {
        await transaction.rolePermissionGrant.createMany({
          data: grants.map((grant) => ({
            organizationId: access.organizationId,
            roleId: role.id,
            permissionCode: grant.permissionCode,
            scope: grant.scope,
          })),
        });
      }
      const updated = await transaction.role.update({
        where: { id: role.id },
        data: { version: { increment: 1 } },
      });
      const users = await transaction.userRoleAssignment.findMany({
        where: { organizationId: access.organizationId, roleId: role.id, endsAt: null },
        select: { userId: true },
      });
      await revokeSessions(
        transaction,
        access.organizationId,
        users.map(({ userId }) => userId),
      );
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'role.grants.replace',
        entityType: 'Role',
        entityId: role.id,
        correlationId,
        before,
        after: grants.map(({ permissionCode, scope }) => ({ permissionCode, scope })),
      });
      await this.outbox.add(
        transaction,
        iamRealtimeEvents.roleGrantsReplaced({
          organizationId: access.organizationId,
          id: role.id,
        }),
      );
      return { id: updated.id, version: updated.version, grants };
    });
  }

  private async requireCustomRole(transaction: Transaction, organizationId: string, id: string) {
    const role = await transaction.role.findFirst({ where: { id, organizationId } });
    if (!role) throw notFound('ROLE_NOT_FOUND', 'roles.notFound');
    if (role.isSystem) throw conflict('SYSTEM_ROLE_IMMUTABLE', 'roles.systemImmutable');
    return role;
  }
}
