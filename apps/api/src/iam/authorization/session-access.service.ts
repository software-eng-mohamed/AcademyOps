import { createHash } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { UserSession } from '@prisma/client';
import type { AccessContext, AccessScope, PermissionCode } from '@academyops/contracts';
import { PrismaService } from '../../platform/database/prisma.service';
import { SessionAccessCacheService } from './session-access-cache.service';

export type RealtimeSessionPrincipal = {
  sessionId: string;
  accessContext: AccessContext;
  isStaff: boolean;
  isStudent: boolean;
};

const sessionTouchIntervalMs = 5 * 60 * 1_000;

@Injectable()
export class SessionAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly cache?: SessionAccessCacheService,
  ) {}

  authenticateHttpSession(rawToken: string): Promise<UserSession> {
    return this.findActiveSessionByToken(rawToken);
  }

  async buildHttpAccessContext(session: UserSession): Promise<AccessContext> {
    const mfaState = session.mfaVerifiedAt ? session.mfaVerifiedAt.toISOString() : 'none';
    if (this.cache) {
      const cached = await this.cache.get(session.id, mfaState);
      if (cached) return cached;
    }
    const context = await this.buildAccessContext(session);
    if (this.cache) {
      await this.cache.set(session.id, session.organizationId, session.userId, mfaState, context);
    }
    return context;
  }

  async invalidateSessionCache(sessionId: string): Promise<void> {
    if (this.cache) await this.cache.invalidateSession(sessionId);
  }

  async invalidateUserCache(userId: string): Promise<void> {
    if (this.cache) await this.cache.invalidateUser(userId);
  }

  async authenticateRealtime(rawToken: string): Promise<RealtimeSessionPrincipal> {
    const session = await this.findActiveSessionByToken(rawToken);
    return this.buildRealtimePrincipal(session);
  }

  async revalidateRealtime(sessionId: string): Promise<RealtimeSessionPrincipal> {
    const session = await this.prisma.userSession.findUnique({ where: { id: sessionId } });
    if (!this.isActiveSession(session)) throw this.invalidSession();
    return this.buildRealtimePrincipal(session);
  }

  private async findActiveSessionByToken(rawToken: string): Promise<UserSession> {
    const pepper = this.config.getOrThrow<string>('SESSION_PEPPER');
    const tokenHash = createHash('sha256').update(`${rawToken}:${pepper}`).digest('hex');
    const session = await this.prisma.userSession.findUnique({ where: { tokenHash } });
    if (!this.isActiveSession(session)) throw this.invalidSession();
    const now = new Date();
    const idleTimeoutMs = session.idleTimeoutSeconds * 1_000;
    if (session.lastSeenAt <= new Date(now.getTime() - sessionTouchIntervalMs)) {
      const touched = await this.prisma.userSession.updateMany({
        where: {
          id: session.id,
          revokedAt: null,
          expiresAt: { gt: now },
          lastSeenAt: { gt: new Date(now.getTime() - idleTimeoutMs) },
        },
        data: { lastSeenAt: now },
      });
      if (touched.count !== 1) throw this.invalidSession();
      session.lastSeenAt = now;
    }
    return session;
  }

  private isActiveSession(session: UserSession | null): session is UserSession {
    const now = Date.now();
    return Boolean(
      session &&
      !session.revokedAt &&
      session.expiresAt.getTime() > now &&
      session.lastSeenAt.getTime() > now - session.idleTimeoutSeconds * 1_000,
    );
  }

  private async buildRealtimePrincipal(session: UserSession): Promise<RealtimeSessionPrincipal> {
    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || user.organizationId !== session.organizationId || user.status !== 'ACTIVE') {
      throw this.invalidSession();
    }
    const accessContext = await this.buildAccessContext(session, user);
    const now = new Date();
    const assignments = await this.activeRoleAssignments(
      session.organizationId,
      session.userId,
      now,
    );
    const roles = await this.prisma.role.findMany({
      where: {
        organizationId: session.organizationId,
        id: { in: assignments.map(({ roleId }) => roleId) },
      },
      select: { code: true },
    });
    const hasActionableGrant = [...accessContext.grants.keys()].some(
      (permission) => !String(permission).startsWith('__'),
    );
    const isStudent =
      hasActionableGrant &&
      (roles.some(({ code }) => code === 'STUDENT') ||
        (await this.prisma.enrollment.count({
          where: {
            organizationId: session.organizationId,
            studentPersonId: user.personId,
          },
        })) > 0);
    const isStaff =
      hasActionableGrant &&
      (roles.some(({ code }) => code !== 'STUDENT') ||
        (await this.prisma.staffProfile.count({
          where: {
            organizationId: session.organizationId,
            personId: user.personId,
            isActive: true,
          },
        })) > 0);
    return { sessionId: session.id, accessContext, isStaff, isStudent };
  }

  private async buildAccessContext(
    session: UserSession,
    providedUser?: {
      id: string;
      organizationId: string;
      personId: string;
      status: string;
      mustChangePassword: boolean;
    },
  ): Promise<AccessContext> {
    const now = new Date();
    const user =
      providedUser ?? (await this.prisma.user.findUnique({ where: { id: session.userId } }));
    if (!user || user.organizationId !== session.organizationId || user.status !== 'ACTIVE') {
      throw this.invalidSession();
    }
    const assignments = await this.activeRoleAssignments(
      session.organizationId,
      session.userId,
      now,
    );
    const roleIds = assignments.map(({ roleId }) => roleId);
    const requiresMfa =
      (await this.prisma.role.count({
        where: {
          organizationId: session.organizationId,
          id: { in: roleIds },
          code: { not: 'STUDENT' },
        },
      })) > 0;
    const hasMfaConfigured =
      ((await this.prisma.mfaFactor?.count?.({
        where: {
          organizationId: session.organizationId,
          userId: session.userId,
          type: 'TOTP',
          verifiedAt: { not: null },
          revokedAt: null,
        },
      })) ?? 0) > 0;
    const grants = await this.prisma.rolePermissionGrant.findMany({
      where: {
        organizationId: session.organizationId,
        roleId: { in: roleIds },
        ...(user.mustChangePassword
          ? { permissionCode: '__PASSWORD_CHANGE_ONLY__' }
          : requiresMfa && hasMfaConfigured && !session.mfaVerifiedAt
            ? { permissionCode: '__MFA_SETUP_ONLY__' }
            : {}),
      },
      select: { permissionCode: true, scope: true },
    });
    const grantMap = new Map<PermissionCode, Set<AccessScope>>();
    for (const grant of grants) {
      const code = grant.permissionCode as PermissionCode;
      const scopes = grantMap.get(code) ?? new Set<AccessScope>();
      scopes.add(grant.scope as AccessScope);
      grantMap.set(code, scopes);
    }
    const branchIds = await this.activeBranchIds(session.organizationId, user.personId, now);
    return {
      organizationId: session.organizationId,
      actorUserId: session.userId,
      grants: grantMap,
      branchIds,
      assignedResourceIds: new Set(),
      studentPersonId: user.personId,
      hasMfaConfigured,
      ...(session.mfaVerifiedAt ? { mfaVerifiedAt: session.mfaVerifiedAt.toISOString() } : {}),
    };
  }

  private activeRoleAssignments(organizationId: string, userId: string, now: Date) {
    return this.prisma.userRoleAssignment.findMany({
      where: {
        organizationId,
        userId,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      select: { roleId: true },
    });
  }

  private async activeBranchIds(
    organizationId: string,
    personId: string,
    now: Date,
  ): Promise<Set<string>> {
    const staff = await this.prisma.staffProfile.findUnique({
      where: { organizationId_personId: { organizationId, personId } },
      select: { id: true },
    });
    const assignments = staff
      ? await this.prisma.staffBranchAssignment.findMany({
          where: {
            organizationId,
            staffProfileId: staff.id,
            startsAt: { lte: now },
            OR: [{ endsAt: null }, { endsAt: { gt: now } }],
          },
          select: { branchId: true },
        })
      : [];
    const branches = await this.prisma.branch.findMany({
      where: {
        organizationId,
        id: { in: assignments.map(({ branchId }) => branchId) },
        isActive: true,
      },
      select: { id: true },
    });
    return new Set(branches.map(({ id }) => id));
  }

  private invalidSession(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'SESSION_INVALID',
      messageKey: 'auth.sessionInvalid',
    });
  }
}
