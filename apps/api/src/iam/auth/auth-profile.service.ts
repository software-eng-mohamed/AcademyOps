import { Injectable } from '@nestjs/common';
import type { AccessContext, AccessScope, PermissionCode } from '@academyops/contracts';
import { AuditService } from '../../platform/audit/audit.service';
import { PrismaService } from '../../platform/database/prisma.service';
import type { UpdatePreferencesDto } from './auth.dto';
import { invalidCredentials, versionConflict } from './auth-common';
export type CurrentUserSummary = {
  id: string;
  version: number;
  organization: {
    id: string;
    code: string;
    name: string;
  };
  name: string;
  preferredLocale: 'ar' | 'en' | null;
  localePreferenceSet: boolean;
  onboardingCompleted: boolean;
  branches: Array<{
    id: string;
    code: string;
    name: string;
  }>;
  roles: Array<{
    code: string;
    name: string;
  }>;
  permissions: Array<{
    code: PermissionCode;
    scopes: AccessScope[];
  }>;
  mfaRequired: boolean;
  mfaVerified: boolean;
  mfaSetupRequired: boolean;
  passwordChangeRequired: boolean;
};
export function rolesRequireMfa(roleCodes: readonly string[]): boolean {
  return roleCodes.some((code) => code !== 'STUDENT');
}
@Injectable()
export class AuthProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  async me(access: AccessContext): Promise<CurrentUserSummary> {
    const user = await this.prisma.user.findFirstOrThrow({
      where: { id: access.actorUserId, organizationId: access.organizationId, status: 'ACTIVE' },
    });
    const [organization, person, assignments, verifiedFactorCount] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: access.organizationId } }),
      this.prisma.person.findFirstOrThrow({
        where: { id: user.personId, organizationId: access.organizationId },
      }),
      this.prisma.userRoleAssignment.findMany({
        where: {
          organizationId: access.organizationId,
          userId: user.id,
          startsAt: { lte: new Date() },
          OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
        },
        select: { roleId: true },
      }),
      this.prisma.mfaFactor.count({
        where: {
          organizationId: access.organizationId,
          userId: user.id,
          verifiedAt: { not: null },
          revokedAt: null,
        },
      }),
    ]);
    const roles = await this.prisma.role.findMany({
      where: {
        organizationId: access.organizationId,
        id: { in: assignments.map(({ roleId }) => roleId) },
      },
      orderBy: { code: 'asc' },
    });
    const organizationWide = [...access.grants.values()].some((scopes) => scopes.has('O'));
    const branches = await this.prisma.branch.findMany({
      where: {
        organizationId: access.organizationId,
        isActive: true,
        ...(organizationWide ? {} : { id: { in: [...access.branchIds] } }),
      },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true },
    });
    const mfaRequired = rolesRequireMfa(roles.map((role) => role.code));
    return {
      id: user.id,
      version: user.version,
      organization: {
        id: organization.id,
        code: organization.code,
        name: organization.name,
      },
      name: person.name ?? person.publicId,
      preferredLocale:
        user.preferredLocale === 'en' ? 'en' : user.preferredLocale === 'ar' ? 'ar' : null,
      localePreferenceSet: user.preferredLocale !== null,
      onboardingCompleted: Boolean(user.onboardingCompletedAt),
      branches: branches.map((branch) => ({
        id: branch.id,
        code: branch.code,
        name: branch.name,
      })),
      roles: roles.map((role) => ({
        code: role.code,
        name: role.name,
      })),
      permissions: [...access.grants.entries()].map(([code, scopes]) => ({
        code,
        scopes: [...scopes],
      })),
      mfaRequired,
      mfaVerified: Boolean(access.mfaVerifiedAt),
      mfaSetupRequired: mfaRequired && verifiedFactorCount === 0,
      passwordChangeRequired: user.mustChangePassword,
    };
  }
  async updatePreferences(
    access: AccessContext,
    input: UpdatePreferencesDto,
    expectedVersion: number,
    correlationId: string,
  ): Promise<CurrentUserSummary> {
    await this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findFirst({
        where: { id: access.actorUserId, organizationId: access.organizationId },
      });
      if (!user) throw invalidCredentials();
      const updated = await transaction.user.updateMany({
        where: { id: user.id, organizationId: access.organizationId, version: expectedVersion },
        data: { preferredLocale: input.preferredLocale, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw versionConflict();
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'user.preferences.update',
        entityType: 'User',
        entityId: access.actorUserId,
        correlationId,
        before: { preferredLocale: user.preferredLocale, version: user.version },
        after: { preferredLocale: input.preferredLocale, version: user.version + 1 },
      });
    });
    return this.me(access);
  }
  async completeOnboarding(
    access: AccessContext,
    expectedVersion: number,
    correlationId: string,
  ): Promise<CurrentUserSummary> {
    await this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findFirst({
        where: { id: access.actorUserId, organizationId: access.organizationId },
      });
      if (!user) throw invalidCredentials();
      const updated = await transaction.user.updateMany({
        where: { id: user.id, organizationId: access.organizationId, version: expectedVersion },
        data: { onboardingCompletedAt: new Date(), version: { increment: 1 } },
      });
      if (updated.count !== 1) throw versionConflict();
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'user.onboarding.complete',
        entityType: 'User',
        entityId: access.actorUserId,
        correlationId,
        after: { onboardingCompleted: true, version: user.version + 1 },
      });
    });
    return this.me(access);
  }
}
