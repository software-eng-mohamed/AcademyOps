import { hash } from 'argon2';
import { Prisma, PrismaClient } from '@prisma/client';
import { defaultRoleGrants } from '@academyops/contracts';
import { config } from 'dotenv';
config();
const prisma = new PrismaClient();
const PUBLIC_ID = 'OTP-OPERATOR-001';
const EMPLOYEE_CODE = 'OTP-OPERATOR-001';
function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
function input() {
  if (required('OTP_OPERATOR_PROVISION_CONFIRM') !== 'provision-otp-operator') {
    throw new Error('OTP_OPERATOR_PROVISION_CONFIRM is invalid.');
  }
  const password = required('OTP_OPERATOR_PASSWORD');
  if (password.length < 14)
    throw new Error('OTP_OPERATOR_PASSWORD must be at least 14 characters.');
  const email = required('OTP_OPERATOR_EMAIL').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('OTP_OPERATOR_EMAIL is invalid.');
  return {
    organizationCode: required('OTP_OPERATOR_ORGANIZATION_CODE').toUpperCase(),
    email,
    password,
  };
}
async function assertCanonicalRole(organizationId: string) {
  const role = await prisma.role.findUnique({
    where: { organizationId_code: { organizationId, code: 'OTP_OPERATOR' } },
  });
  if (!role?.isSystem) throw new Error('Run database migrations before provisioning OTP_OPERATOR.');
  const grants = await prisma.rolePermissionGrant.findMany({
    where: { organizationId, roleId: role.id },
    select: { permissionCode: true, scope: true },
  });
  const actual = new Set(grants.map(({ permissionCode, scope }) => `${permissionCode}:${scope}`));
  const expected = new Set(
    defaultRoleGrants.OTP_OPERATOR.map(([code, scope]) => `${code}:${scope}`),
  );
  if (actual.size !== expected.size || [...expected].some((grant) => !actual.has(grant))) {
    throw new Error('OTP_OPERATOR grants do not match the canonical allowlist.');
  }
  return role;
}
async function provision(): Promise<void> {
  const request = input();
  const organization = await prisma.organization.findUnique({
    where: { code: request.organizationCode },
  });
  if (!organization) throw new Error('Target organization does not exist.');
  const [role, branch, passwordHash] = await Promise.all([
    assertCanonicalRole(organization.id),
    prisma.branch.findUnique({
      where: { organizationId_code: { organizationId: organization.id, code: 'MAIN' } },
    }),
    hash(request.password, { type: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 }),
  ]);
  if (!branch?.isActive) throw new Error('An active MAIN branch is required.');
  const now = new Date();
  await prisma.$transaction(
    async (tx) => {
      const person = await tx.person.upsert({
        where: {
          organizationId_publicId: { organizationId: organization.id, publicId: PUBLIC_ID },
        },
        update: { name: 'WhatsApp OTP Operator' },
        create: {
          organizationId: organization.id,
          publicId: PUBLIC_ID,
          name: 'WhatsApp OTP Operator',
        },
      });
      const currentUser = await tx.user.findUnique({
        where: {
          organizationId_personId: { organizationId: organization.id, personId: person.id },
        },
      });
      const emailIdentity = await tx.userLoginIdentifier.findFirst({
        where: { organizationId: organization.id, type: 'EMAIL', normalizedValue: request.email },
      });
      if (emailIdentity && emailIdentity.userId !== currentUser?.id) {
        throw new Error('OTP_OPERATOR_EMAIL is already bound to another account.');
      }
      const user = await tx.user.upsert({
        where: {
          organizationId_personId: { organizationId: organization.id, personId: person.id },
        },
        update: {
          status: 'ACTIVE',
          passwordHash,
          passwordChangedAt: now,
          mustChangePassword: false,
          preferredLocale: 'ar',
        },
        create: {
          organizationId: organization.id,
          personId: person.id,
          status: 'ACTIVE',
          passwordHash,
          passwordChangedAt: now,
          mustChangePassword: false,
          preferredLocale: 'ar',
        },
      });
      await tx.userSession.deleteMany({
        where: { organizationId: organization.id, userId: user.id },
      });
      await tx.userLoginIdentifier.updateMany({
        where: {
          organizationId: organization.id,
          userId: user.id,
          type: 'EMAIL',
          normalizedValue: { not: request.email },
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
      if (emailIdentity) {
        await tx.userLoginIdentifier.update({
          where: { id: emailIdentity.id },
          data: { verifiedAt: now, revokedAt: null },
        });
      } else {
        await tx.userLoginIdentifier.create({
          data: {
            organizationId: organization.id,
            userId: user.id,
            type: 'EMAIL',
            normalizedValue: request.email,
            verifiedAt: now,
          },
        });
      }
      await tx.personContact.updateMany({
        where: { organizationId: organization.id, personId: person.id, type: 'EMAIL' },
        data: { isPrimary: false },
      });
      const contact = await tx.personContact.findFirst({
        where: {
          organizationId: organization.id,
          personId: person.id,
          type: 'EMAIL',
          normalizedValue: request.email,
        },
      });
      const contactData = {
        rawValue: request.email,
        normalizedValue: request.email,
        isPrimary: true,
        verifiedAt: now,
      };
      if (contact) await tx.personContact.update({ where: { id: contact.id }, data: contactData });
      else
        await tx.personContact.create({
          data: {
            organizationId: organization.id,
            personId: person.id,
            type: 'EMAIL',
            ...contactData,
          },
        });
      const staff = await tx.staffProfile.upsert({
        where: {
          organizationId_personId: { organizationId: organization.id, personId: person.id },
        },
        update: { employeeCode: EMPLOYEE_CODE, isActive: true },
        create: {
          organizationId: organization.id,
          personId: person.id,
          employeeCode: EMPLOYEE_CODE,
        },
      });
      await replaceAssignments(tx, organization.id, user.id, staff.id, role.id, branch.id, now);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  process.stdout.write(
    `${JSON.stringify({ organizationCode: request.organizationCode, email: request.email, role: 'OTP_OPERATOR', mustChangePassword: false, mfaSetupRequired: true })}\n`,
  );
}
async function replaceAssignments(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  staffProfileId: string,
  roleId: string,
  branchId: string,
  now: Date,
) {
  await tx.userRoleAssignment.deleteMany({
    where: { organizationId, userId, startsAt: { gt: now } },
  });
  await tx.userRoleAssignment.updateMany({
    where: {
      organizationId,
      userId,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    data: { endsAt: now },
  });
  await tx.userRoleAssignment.create({ data: { organizationId, userId, roleId, startsAt: now } });
  const branchAssignment = await tx.staffBranchAssignment.findFirst({
    where: { organizationId, staffProfileId, branchId, endsAt: null },
  });
  if (!branchAssignment) {
    await tx.staffBranchAssignment.create({ data: { organizationId, staffProfileId, branchId } });
  }
}
provision()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Provisioning failed.'}\n`);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
