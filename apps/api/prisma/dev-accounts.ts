import {
  accounts,
  organizationCode,
  defaultPassword,
  publicId,
  requiresMfa,
  type DevAccount,
} from './dev-account-catalog';
import { hash } from 'argon2';
import { PrismaClient, type User } from '@prisma/client';
import type { DefaultRoleCode } from '@academyops/contracts';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { encryptSecret, generateTotpSecret } from '../src/iam/auth/totp';
config({ path: resolve(__dirname, '../.env') });
const prisma = new PrismaClient();
function assertDevelopmentDatabase(): void {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('Development accounts may only be managed with NODE_ENV=development.');
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const hostname = new URL(databaseUrl).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    throw new Error(`Refusing to mutate a non-local database host: ${hostname}.`);
  }
  if ((process.env.MFA_ENCRYPTION_KEY?.length ?? 0) < 32) {
    throw new Error('MFA_ENCRYPTION_KEY must contain at least 32 characters.');
  }
}
async function upsertProfiles(
  organizationId: string,
  branchId: string,
  account: DevAccount,
  user: User,
): Promise<void> {
  if (account.role === 'STUDENT') {
    await prisma.studentProfile.upsert({
      where: { organizationId_personId: { organizationId, personId: user.personId } },
      update: { portalStatus: 'ACTIVE' },
      create: { organizationId, personId: user.personId, portalStatus: 'ACTIVE' },
    });
    return;
  }
  const staff = await prisma.staffProfile.upsert({
    where: { organizationId_personId: { organizationId, personId: user.personId } },
    update: { employeeCode: publicId(account), isActive: true },
    create: { organizationId, personId: user.personId, employeeCode: publicId(account) },
  });
  const branches = await prisma.branch.findMany({ where: { organizationId } });
  for (const b of branches) {
    const branchAssignment = await prisma.staffBranchAssignment.findFirst({
      where: { organizationId, staffProfileId: staff.id, branchId: b.id, endsAt: null },
    });
    if (!branchAssignment) {
      await prisma.staffBranchAssignment.create({
        data: { organizationId, staffProfileId: staff.id, branchId: b.id },
      });
    }
  }
  if (account.role === 'TRAINER') {
    await prisma.trainerProfile.upsert({
      where: { organizationId_personId: { organizationId, personId: user.personId } },
      update: { status: 'ACTIVE' },
      create: { organizationId, personId: user.personId, status: 'ACTIVE' },
    });
  }
}
async function upsertAccount(
  organizationId: string,
  branchId: string,
  roleIds: ReadonlyMap<DefaultRoleCode, string>,
  account: DevAccount,
  passwordHash: string,
): Promise<void> {
  const existingIdentifier = await prisma.userLoginIdentifier.findFirst({
    where: {
      organizationId,
      type: 'EMAIL',
      normalizedValue: account.email,
      revokedAt: null,
    },
    select: { userId: true },
  });
  const userState = {
    status: 'ACTIVE',
    passwordHash,
    preferredLocale: 'ar',
    onboardingCompletedAt: new Date('2026-01-01T00:00:00Z'),
    mustChangePassword: false,
    passwordChangedAt: new Date(),
  } as const;
  let user: User;
  if (existingIdentifier) {
    const existingUser = await prisma.user.findFirstOrThrow({
      where: { id: existingIdentifier.userId, organizationId },
    });
    await prisma.person.update({
      where: { id: existingUser.personId },
      data: { name: account.name },
    });
    user = await prisma.user.update({ where: { id: existingUser.id }, data: userState });
  } else {
    const person = await prisma.person.upsert({
      where: { organizationId_publicId: { organizationId, publicId: publicId(account) } },
      update: { name: account.name },
      create: {
        organizationId,
        publicId: publicId(account),
        name: account.name,
      },
    });
    user = await prisma.user.upsert({
      where: { organizationId_personId: { organizationId, personId: person.id } },
      update: userState,
      create: {
        organizationId,
        personId: person.id,
        ...userState,
      },
    });
  }
  await prisma.userSession.deleteMany({ where: { organizationId, userId: user.id } });
  await prisma.userLoginIdentifier.deleteMany({ where: { organizationId, userId: user.id } });
  await prisma.userLoginIdentifier.create({
    data: {
      organizationId,
      userId: user.id,
      type: 'EMAIL',
      normalizedValue: account.email,
      verifiedAt: new Date(),
    },
  });
  await upsertProfiles(organizationId, branchId, account, user);
  await prisma.userRoleAssignment.updateMany({
    where: { organizationId, userId: user.id, endsAt: null },
    data: { endsAt: new Date() },
  });
  if (account.role) {
    await prisma.userRoleAssignment.create({
      data: { organizationId, userId: user.id, roleId: roleIds.get(account.role)! },
    });
  }
  await prisma.mfaRecoveryCode.deleteMany({ where: { organizationId, userId: user.id } });
  await prisma.mfaFactor.deleteMany({ where: { organizationId, userId: user.id } });
  if (requiresMfa(account)) {
    await prisma.mfaFactor.create({
      data: {
        organizationId,
        userId: user.id,
        type: 'TOTP',
        label: 'Local development account',
        secretCipher: encryptSecret(generateTotpSecret(), process.env.MFA_ENCRYPTION_KEY!),
        verifiedAt: new Date(),
      },
    });
  }
}
async function seed(): Promise<void> {
  assertDevelopmentDatabase();
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { code: organizationCode },
  });
  const branch = await prisma.branch.findUniqueOrThrow({
    where: { organizationId_code: { organizationId: organization.id, code: 'MAIN' } },
  });
  const roles = await prisma.role.findMany({ where: { organizationId: organization.id } });
  const roleIds = new Map(roles.map((role) => [role.code as DefaultRoleCode, role.id]));
  for (const account of accounts) {
    if (account.role && !roleIds.has(account.role)) {
      throw new Error(`Missing role ${account.role}; run the base Prisma seed first.`);
    }
  }
  const password = process.env.DEV_ACCOUNTS_PASSWORD?.trim() || defaultPassword;
  if (password.length < 12)
    throw new Error('DEV_ACCOUNTS_PASSWORD must be at least 12 characters.');
  const passwordHash = await hash(password, {
    type: 2,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  for (const account of accounts) {
    await upsertAccount(organization.id, branch.id, roleIds, account, passwordHash);
  }
  await verify();
}
async function verify(): Promise<void> {
  assertDevelopmentDatabase();
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { code: organizationCode },
    select: { id: true },
  });
  const identifiers = await prisma.userLoginIdentifier.findMany({
    where: {
      organizationId: organization.id,
      type: 'EMAIL',
      normalizedValue: { in: accounts.map((account) => account.email) },
      revokedAt: null,
    },
    select: { normalizedValue: true, userId: true },
  });
  if (identifiers.length !== accounts.length) {
    throw new Error(
      `Expected ${accounts.length} development accounts, found ${identifiers.length}.`,
    );
  }
  const assignments = await prisma.userRoleAssignment.findMany({
    where: {
      organizationId: organization.id,
      userId: { in: identifiers.map((identifier) => identifier.userId) },
      endsAt: null,
    },
    select: { userId: true, roleId: true },
  });
  const assignedRoles = await prisma.role.findMany({
    where: {
      organizationId: organization.id,
      id: { in: assignments.map((assignment) => assignment.roleId) },
    },
    select: { id: true, code: true },
  });
  const roleCodeById = new Map(assignedRoles.map((role) => [role.id, role.code]));
  const userIdByEmail = new Map(
    identifiers.map((identifier) => [identifier.normalizedValue, identifier.userId]),
  );
  for (const account of accounts) {
    const userId = userIdByEmail.get(account.email);
    const actualCodes = assignments
      .filter((assignment) => assignment.userId === userId)
      .map((assignment) => roleCodeById.get(assignment.roleId))
      .filter((code): code is string => Boolean(code))
      .sort();
    const expectedCodes = account.role ? [account.role] : [];
    if (actualCodes.join(',') !== expectedCodes.join(',')) {
      throw new Error(
        `Expected roles [${expectedCodes.join(',')}] for ${account.email}, found [${actualCodes.join(',')}].`,
      );
    }
  }
  const mfaCount = await prisma.mfaFactor.count({
    where: {
      organizationId: organization.id,
      userId: { in: identifiers.map((identifier) => identifier.userId) },
      type: 'TOTP',
      verifiedAt: { not: null },
      revokedAt: null,
    },
  });
  const expectedMfaCount = accounts.filter(requiresMfa).length;
  if (mfaCount !== expectedMfaCount) {
    throw new Error(`Expected ${expectedMfaCount} TOTP factors, found ${mfaCount}.`);
  }
  console.log(
    `Development accounts verified: ${JSON.stringify({ accounts: identifiers.length, mfaFactors: mfaCount, organizationCode })}.`,
  );
}
async function main(): Promise<void> {
  const action = process.argv[2];
  if (action === 'seed') return seed();
  if (action === 'verify') return verify();
  throw new Error('Usage: dev-accounts.ts <seed|verify>');
}
main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Development account command failed.');
    await prisma.$disconnect();
    process.exitCode = 1;
  });
