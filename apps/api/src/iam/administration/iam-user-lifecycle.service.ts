import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { hash } from 'argon2';
import type { AccessContext } from '@academyops/contracts';
import { AuditService } from '../../platform/audit/audit.service';
import { PrismaService } from '../../platform/database/prisma.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { normalizeEmail } from '../../imports/normalization';
import type { CreateUserDto, UpdateUserStatusDto } from './iam-administration.dto';
import { iamRealtimeEvents } from './iam-realtime-events';
import { conflict, notFound, revokeSessions, versionConflict } from './iam-administration.utils';
import { IamUserReadService } from './iam-user-read.service';
import { assertOwnerContinuity } from './last-owner-policy';
import { assertBranchDelegation, assertGrantDelegation } from './iam-delegation-policy';
const passwordHashOptions = {
  type: 2,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;
@Injectable()
export class IamUserLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly userRead: IamUserReadService,
  ) {}
  async createUser(access: AccessContext, input: CreateUserDto, correlationId: string) {
    if (!input.name) {
      throw conflict('USER_NAME_REQUIRED', 'users.nameRequired');
    }
    if (input.activateNow && (!input.temporaryPassword || !input.activationReason)) {
      throw conflict('USER_ACTIVATION_PROOF_REQUIRED', 'users.activationProofRequired');
    }
    const email = normalizeEmail(input.email);
    if (!email) throw conflict('USER_EMAIL_INVALID', 'users.emailInvalid');
    const [roles, branches, duplicate] = await Promise.all([
      this.prisma.role.findMany({
        where: { organizationId: access.organizationId, id: { in: input.roleIds } },
      }),
      this.prisma.branch.findMany({
        where: {
          organizationId: access.organizationId,
          id: { in: input.branchIds },
          isActive: true,
        },
      }),
      this.prisma.userLoginIdentifier.findFirst({
        where: {
          organizationId: access.organizationId,
          type: 'EMAIL',
          normalizedValue: email,
          revokedAt: null,
        },
      }),
    ]);
    if (roles.length !== input.roleIds.length)
      throw conflict('ROLE_SELECTION_INVALID', 'roles.selectionInvalid');
    if (branches.length !== input.branchIds.length)
      throw conflict('BRANCH_SELECTION_INVALID', 'branches.selectionInvalid');
    if (duplicate) throw conflict('USER_IDENTIFIER_EXISTS', 'users.identifierExists');
    const roleGrants = await this.prisma.rolePermissionGrant.findMany({
      where: { organizationId: access.organizationId, roleId: { in: roles.map(({ id }) => id) } },
      select: { permissionCode: true, scope: true },
    });
    assertGrantDelegation(access, roleGrants);
    assertBranchDelegation(
      access,
      branches.map(({ id }) => id),
    );
    const passwordHash = input.temporaryPassword
      ? await hash(input.temporaryPassword, passwordHashOptions)
      : null;
    const userId = await this.prisma.$transaction(async (transaction) => {
      const person = await transaction.person.create({
        data: {
          organizationId: access.organizationId,
          publicId: `STAFF-${randomBytes(6).toString('hex').toUpperCase()}`,
          name: input.name?.trim() ?? null,
        },
      });
      const user = await transaction.user.create({
        data: {
          organizationId: access.organizationId,
          personId: person.id,
          status: input.activateNow ? 'ACTIVE' : 'PENDING',
          passwordHash,
          mustChangePassword: Boolean(passwordHash),
          preferredLocale: input.preferredLocale ?? 'ar',
        },
      });
      const staff = await transaction.staffProfile.create({
        data: {
          organizationId: access.organizationId,
          personId: person.id,
          employeeCode: input.employeeCode?.trim() ?? null,
          isActive: Boolean(input.activateNow),
        },
      });
      await transaction.userLoginIdentifier.create({
        data: {
          organizationId: access.organizationId,
          userId: user.id,
          type: 'EMAIL',
          normalizedValue: email,
          verifiedAt: input.activateNow ? new Date() : null,
        },
      });
      if (roles.length) {
        await transaction.userRoleAssignment.createMany({
          data: roles.map((role) => ({
            organizationId: access.organizationId,
            userId: user.id,
            roleId: role.id,
          })),
        });
      }
      if (branches.length) {
        await transaction.staffBranchAssignment.createMany({
          data: branches.map((branch) => ({
            organizationId: access.organizationId,
            staffProfileId: staff.id,
            branchId: branch.id,
          })),
        });
      }
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'user.create',
        entityType: 'User',
        entityId: user.id,
        correlationId,
        after: {
          status: user.status,
          email,
          roleIds: roles.map(({ id }) => id),
          branchIds: branches.map(({ id }) => id),
        },
        ...(input.activateNow ? { metadata: { activationReason: input.activationReason! } } : {}),
      });
      await this.outbox.add(
        transaction,
        iamRealtimeEvents.userCreated(
          { organizationId: access.organizationId, id: user.id },
          user.status,
        ),
      );
      if (!input.activateNow) {
        await this.outbox.add(transaction, {
          organizationId: access.organizationId,
          aggregateType: 'User',
          aggregateId: user.id,
          type: 'user.activation_requested',
          payload: { userId: user.id, email },
        });
      }
      return user.id;
    });
    return this.userRead.buildUserSummary(access.organizationId, userId);
  }
  async updateUserStatus(
    access: AccessContext,
    id: string,
    input: UpdateUserStatusDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    if (id === access.actorUserId && input.status === 'SUSPENDED') {
      throw conflict('SELF_SUSPENSION_FORBIDDEN', 'users.selfSuspensionForbidden');
    }
    await this.prisma.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid AND organization_id = ${access.organizationId}::uuid FOR UPDATE`;
      const user = await transaction.user.findFirst({
        where: { id, organizationId: access.organizationId },
      });
      if (!user) throw notFound('USER_NOT_FOUND', 'users.notFound');
      if (user.version !== expectedVersion) throw versionConflict();
      const assignments = await transaction.userRoleAssignment.findMany({
        where: {
          organizationId: access.organizationId,
          userId: user.id,
          startsAt: { lte: new Date() },
          OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
        },
        select: { roleId: true },
      });
      const roleGrants = await transaction.rolePermissionGrant.findMany({
        where: {
          organizationId: access.organizationId,
          roleId: { in: assignments.map(({ roleId }) => roleId) },
        },
        select: { permissionCode: true, scope: true },
      });
      assertGrantDelegation(access, roleGrants);
      if (input.status !== 'ACTIVE') {
        await assertOwnerContinuity(transaction, access.organizationId, user.id);
      }
      if (input.status === 'ACTIVE') {
        const verifiedIdentifier = await transaction.userLoginIdentifier.findFirst({
          where: {
            organizationId: access.organizationId,
            userId: user.id,
            verifiedAt: { not: null },
            revokedAt: null,
          },
        });
        if (!user.passwordHash || !verifiedIdentifier) {
          throw conflict('USER_ACTIVATION_INCOMPLETE', 'users.activationIncomplete');
        }
      }
      const updated = await transaction.user.update({
        where: { id: user.id },
        data: { status: input.status, version: { increment: 1 } },
      });
      await transaction.staffProfile.updateMany({
        where: { organizationId: access.organizationId, personId: user.personId },
        data: { isActive: input.status === 'ACTIVE' },
      });
      if (input.status !== 'ACTIVE') {
        await revokeSessions(transaction, access.organizationId, [user.id]);
      }
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'user.status.update',
        entityType: 'User',
        entityId: user.id,
        correlationId,
        before: { status: user.status },
        after: { status: updated.status },
        metadata: { reason: input.reason },
      });
      await this.outbox.add(
        transaction,
        iamRealtimeEvents.userStatusChanged(
          { organizationId: access.organizationId, id: user.id },
          updated.status,
        ),
      );
    });
    return this.userRead.buildUserSummary(access.organizationId, id);
  }
}
