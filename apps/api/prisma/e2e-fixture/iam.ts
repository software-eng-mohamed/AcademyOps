import { hash } from 'argon2';
import type { Branch, Organization, PrismaClient, Role, User } from '@prisma/client';
import { defaultRoleGrants, permissions, type DefaultRoleCode } from '@academyops/contracts';
import { encryptSecret } from '../../src/iam/auth/totp';
import {
  FIXTURE_ORGANIZATION_CODE,
  FIXTURE_ORGANIZATION_NAME,
  FIXTURE_ROLES,
  MFA_ROLES,
  ROLE_CODES,
  type FixtureRole,
} from './constants';
import { findFixtureOrganization } from './safety';
import type { FixtureAccountSecret, FixtureArtifact } from './types';
const roleNames: Record<string, string> = {
  OWNER: 'Synthetic Owner',
  OPERATIONS: 'Synthetic Operations',
  ACADEMIC: 'Synthetic Academic',
  RECEPTION: 'Synthetic Reception',
  SALES: 'Synthetic Sales',
  ACCOUNTS: 'Synthetic Accounts',
  ATTENDANCE: 'Synthetic Attendance',
  TRAINER: 'Synthetic Trainer',
  STUDENT: 'Synthetic Student',
  OTP_OPERATOR: 'Synthetic WhatsApp OTP Operator',
};
const fixtureRoleCodes = [
  'OWNER',
  'OPERATIONS',
  'ACADEMIC',
  'RECEPTION',
  'SALES',
  'ACCOUNTS',
  'ATTENDANCE',
  'TRAINER',
  'STUDENT',
  'OTP_OPERATOR',
] as const;
async function organization(prisma: PrismaClient): Promise<Organization> {
  const existing = await findFixtureOrganization(prisma);
  if (existing) return existing;
  return prisma.organization.create({
    data: {
      code: FIXTURE_ORGANIZATION_CODE,
      name: FIXTURE_ORGANIZATION_NAME,
    },
  });
}
async function roles(prisma: PrismaClient, organizationId: string): Promise<Map<string, Role>> {
  await prisma.permission.createMany({
    data: permissions.map((code) => ({ code, description: code })),
    skipDuplicates: true,
  });
  const roleMap = new Map<string, Role>();
  for (const code of fixtureRoleCodes) {
    const role = await prisma.role.upsert({
      where: { organizationId_code: { organizationId, code } },
      update: { name: roleNames[code]!, isSystem: true },
      create: {
        organizationId,
        code,
        name: roleNames[code]!,
        isSystem: true,
      },
    });
    roleMap.set(code, role);
    await prisma.rolePermissionGrant.deleteMany({ where: { organizationId, roleId: role.id } });
    await prisma.rolePermissionGrant.createMany({
      data: defaultRoleGrants[code as DefaultRoleCode].map(([permissionCode, scope]) => ({
        organizationId,
        roleId: role.id,
        permissionCode,
        scope,
      })),
      skipDuplicates: true,
    });
  }
  return roleMap;
}
async function profile(
  prisma: PrismaClient,
  organizationId: string,
  branch: Branch,
  role: FixtureRole,
  user: User,
): Promise<void> {
  if (role === 'student') {
    await prisma.studentProfile.upsert({
      where: { organizationId_personId: { organizationId, personId: user.personId } },
      update: { portalStatus: 'ACTIVE' },
      create: { organizationId, personId: user.personId, portalStatus: 'ACTIVE' },
    });
    return;
  }
  const staff = await prisma.staffProfile.upsert({
    where: { organizationId_personId: { organizationId, personId: user.personId } },
    update: { employeeCode: `E2E-${role.toUpperCase()}`, isActive: true },
    create: {
      organizationId,
      personId: user.personId,
      employeeCode: `E2E-${role.toUpperCase()}`,
    },
  });
  const assignment = await prisma.staffBranchAssignment.findFirst({
    where: { organizationId, staffProfileId: staff.id, branchId: branch.id, endsAt: null },
  });
  if (!assignment) {
    await prisma.staffBranchAssignment.create({
      data: { organizationId, staffProfileId: staff.id, branchId: branch.id },
    });
  }
}
async function account(
  prisma: PrismaClient,
  organizationId: string,
  branch: Branch,
  roleMap: Map<string, Role>,
  role: FixtureRole,
  secret: FixtureAccountSecret,
  mfaKey: string,
): Promise<User> {
  const person = await prisma.person.upsert({
    where: {
      organizationId_publicId: { organizationId, publicId: `E2E-${role.toUpperCase()}` },
    },
    update: { name: `Synthetic ${role} account` },
    create: {
      organizationId,
      publicId: `E2E-${role.toUpperCase()}`,
      name: `Synthetic ${role} account`,
    },
  });
  const firstLogin = role === 'first_login';
  const passwordHash = await hash(secret.password, {
    type: 2,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const user = await prisma.user.upsert({
    where: { organizationId_personId: { organizationId, personId: person.id } },
    update: {
      status: 'ACTIVE',
      passwordHash,
      preferredLocale: firstLogin ? null : 'en',
      onboardingCompletedAt: firstLogin ? null : new Date('2026-01-01T00:00:00Z'),
      mustChangePassword: firstLogin,
    },
    create: {
      organizationId,
      personId: person.id,
      status: 'ACTIVE',
      passwordHash,
      preferredLocale: firstLogin ? null : 'en',
      onboardingCompletedAt: firstLogin ? null : new Date('2026-01-01T00:00:00Z'),
      mustChangePassword: firstLogin,
    },
  });
  await prisma.userSession.deleteMany({ where: { organizationId, userId: user.id } });
  await prisma.userLoginIdentifier.deleteMany({ where: { organizationId, userId: user.id } });
  await prisma.userLoginIdentifier.create({
    data: {
      organizationId,
      userId: user.id,
      type: 'EMAIL',
      normalizedValue: secret.email,
      verifiedAt: new Date(),
    },
  });
  await profile(prisma, organizationId, branch, role, user);
  const roleCode = ROLE_CODES[role];
  if (roleCode) {
    const roleId = roleMap.get(roleCode)!.id;
    await prisma.userRoleAssignment.updateMany({
      where: { organizationId, userId: user.id, roleId: { not: roleId }, endsAt: null },
      data: { endsAt: new Date() },
    });
    const activeAssignment = await prisma.userRoleAssignment.findFirst({
      where: { organizationId, userId: user.id, roleId, endsAt: null },
    });
    if (!activeAssignment) {
      await prisma.userRoleAssignment.create({
        data: { organizationId, userId: user.id, roleId },
      });
    }
  } else {
    await prisma.userRoleAssignment.updateMany({
      where: { organizationId, userId: user.id, endsAt: null },
      data: { endsAt: new Date() },
    });
  }
  await prisma.mfaFactor.deleteMany({ where: { organizationId, userId: user.id } });
  if (MFA_ROLES.has(role)) {
    if (!secret.totpSecret) throw new Error(`Missing generated TOTP secret for ${role}.`);
    await prisma.mfaFactor.create({
      data: {
        organizationId,
        userId: user.id,
        type: 'TOTP',
        label: 'Synthetic E2E fixture',
        secretCipher: encryptSecret(secret.totpSecret, mfaKey),
        verifiedAt: new Date(),
      },
    });
  }
  return user;
}
export async function seedIdentity(
  prisma: PrismaClient,
  artifact: FixtureArtifact,
  mfaKey: string,
): Promise<{
  organization: Organization;
  branch: Branch;
  users: Record<FixtureRole, User>;
}> {
  const org = await organization(prisma);
  const branch = await prisma.branch.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'MAIN' } },
    update: { name: 'Synthetic Main Branch', isActive: true },
    create: {
      organizationId: org.id,
      code: 'MAIN',
      name: 'Synthetic Main Branch',
    },
  });
  const roleMap = await roles(prisma, org.id);
  const entries = await Promise.all(
    FIXTURE_ROLES.map(
      async (role) =>
        [
          role,
          await account(prisma, org.id, branch, roleMap, role, artifact.accounts[role], mfaKey),
        ] as const,
    ),
  );
  return {
    organization: org,
    branch,
    users: Object.fromEntries(entries) as Record<FixtureRole, User>,
  };
}
