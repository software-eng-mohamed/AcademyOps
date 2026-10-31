import { hash } from 'argon2';
import { PrismaClient } from '@prisma/client';
import { defaultRoleGrants, permissions, type DefaultRoleCode } from '@academyops/contracts';
import { config } from 'dotenv';
config();
const prisma = new PrismaClient();
const roleNames: Record<DefaultRoleCode, string> = {
  OWNER: 'Owner',
  RECEPTION: 'Reception',
  SALES: 'Sales',
  ACCOUNTS: 'Accounts',
  ATTENDANCE: 'Attendance',
  ACADEMIC: 'Academic',
  TRAINER: 'Trainer',
  STUDENT: 'Student',
  OTP_OPERATOR: 'WhatsApp OTP Operator',
  OPERATIONS: 'Operations',
};
async function seed(): Promise<void> {
  const organizationCode =
    process.env.BOOTSTRAP_ORGANIZATION_CODE?.trim().toUpperCase() ?? 'ACADEMYOPS';
  const organization = await prisma.organization.upsert({
    where: { code: organizationCode },
    update: { name: 'AcademyOps' },
    create: { code: organizationCode, name: 'AcademyOps' },
  });
  const branch = await prisma.branch.upsert({
    where: { organizationId_code: { organizationId: organization.id, code: 'MAIN' } },
    update: { name: 'Main Branch' },
    create: {
      organizationId: organization.id,
      code: 'MAIN',
      name: 'Main Branch',
    },
  });
  const paymentMethods = [
    { code: 'CASH', name: 'Cash', verificationRequired: false },
    { code: 'INSTAPAY', name: 'InstaPay', verificationRequired: true },
    {
      code: 'VODAFONE_CASH',
      name: 'Vodafone Cash',
      verificationRequired: true,
    },
    {
      code: 'BANK_TRANSFER',
      name: 'Bank Transfer',
      verificationRequired: true,
    },
    { code: 'PAYMOB', name: 'Paymob', verificationRequired: false },
  ];
  for (const pm of paymentMethods) {
    await prisma.paymentMethod.upsert({
      where: { organizationId_code: { organizationId: organization.id, code: pm.code } },
      update: {
        name: pm.name,
        verificationRequired: pm.verificationRequired,
        isActive: true,
      },
      create: {
        organizationId: organization.id,
        code: pm.code,
        name: pm.name,
        verificationRequired: pm.verificationRequired,
        isActive: true,
      },
    });
  }
  await prisma.permission.createMany({
    data: permissions.map((code) => ({ code, description: code })),
    skipDuplicates: true,
  });
  const roles = new Map<DefaultRoleCode, string>();
  for (const roleCode of Object.keys(defaultRoleGrants) as DefaultRoleCode[]) {
    const role = await prisma.role.upsert({
      where: { organizationId_code: { organizationId: organization.id, code: roleCode } },
      update: { name: roleNames[roleCode] },
      create: {
        organizationId: organization.id,
        code: roleCode,
        name: roleNames[roleCode],
        isSystem: true,
      },
    });
    roles.set(roleCode, role.id);
    await prisma.$transaction(async (tx) => {
      await tx.rolePermissionGrant.deleteMany({
        where: {
          organizationId: organization.id,
          roleId: role.id,
        },
      });
      if (defaultRoleGrants[roleCode].length) {
        await tx.rolePermissionGrant.createMany({
          data: defaultRoleGrants[roleCode].map(([permissionCode, scope]) => ({
            organizationId: organization.id,
            roleId: role.id,
            permissionCode,
            scope,
          })),
          skipDuplicates: true,
        });
      }
    });
  }
  const ownerEmail = process.env.BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase();
  const ownerPassword = process.env.BOOTSTRAP_OWNER_PASSWORD;
  if (ownerEmail && ownerPassword) {
    if (ownerPassword.length < 12)
      throw new Error('BOOTSTRAP_OWNER_PASSWORD must be at least 12 characters');
    const existingIdentifier = await prisma.userLoginIdentifier.findFirst({
      where: {
        organizationId: organization.id,
        type: 'EMAIL',
        normalizedValue: ownerEmail,
        revokedAt: null,
      },
    });
    if (!existingIdentifier) {
      const person = await prisma.person.create({
        data: {
          organizationId: organization.id,
          publicId: 'OWNER-001',
          name: 'System Owner',
        },
      });
      const user = await prisma.user.create({
        data: {
          organizationId: organization.id,
          personId: person.id,
          status: 'ACTIVE',
          passwordHash: await hash(ownerPassword, {
            type: 2,
            memoryCost: 19456,
            timeCost: 2,
            parallelism: 1,
          }),
          preferredLocale: 'ar',
        },
      });
      const staff = await prisma.staffProfile.create({
        data: { organizationId: organization.id, personId: person.id, employeeCode: 'OWNER-001' },
      });
      await prisma.userLoginIdentifier.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          type: 'EMAIL',
          normalizedValue: ownerEmail,
          verifiedAt: new Date(),
        },
      });
      await prisma.staffBranchAssignment.create({
        data: { organizationId: organization.id, staffProfileId: staff.id, branchId: branch.id },
      });
      await prisma.userRoleAssignment.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          roleId: roles.get('OWNER')!,
        },
      });
    }
  }
  const demoEmail = process.env.BOOTSTRAP_DEMO_EMAIL?.trim().toLowerCase();
  const demoPassword = process.env.BOOTSTRAP_DEMO_PASSWORD;
  if (demoEmail && demoPassword) {
    if (demoPassword.length < 12)
      throw new Error('BOOTSTRAP_DEMO_PASSWORD must be at least 12 characters');
    const passwordHash = await hash(demoPassword, {
      type: 2,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    const person = await prisma.person.upsert({
      where: {
        organizationId_publicId: {
          organizationId: organization.id,
          publicId: 'DEMO-ACADEMIC-001',
        },
      },
      update: { name: 'Demo Academic User' },
      create: {
        organizationId: organization.id,
        publicId: 'DEMO-ACADEMIC-001',
        name: 'Demo Academic User',
      },
    });
    const user = await prisma.user.upsert({
      where: {
        organizationId_personId: { organizationId: organization.id, personId: person.id },
      },
      update: { status: 'ACTIVE', passwordHash, preferredLocale: 'ar' },
      create: {
        organizationId: organization.id,
        personId: person.id,
        status: 'ACTIVE',
        passwordHash,
        preferredLocale: 'ar',
      },
    });
    const staff = await prisma.staffProfile.upsert({
      where: {
        organizationId_personId: { organizationId: organization.id, personId: person.id },
      },
      update: { isActive: true },
      create: {
        organizationId: organization.id,
        personId: person.id,
        employeeCode: 'DEMO-ACADEMIC-001',
      },
    });
    const identifier = await prisma.userLoginIdentifier.findFirst({
      where: {
        organizationId: organization.id,
        type: 'EMAIL',
        normalizedValue: demoEmail,
      },
    });
    if (identifier) {
      await prisma.userLoginIdentifier.update({
        where: { id: identifier.id },
        data: { userId: user.id, verifiedAt: new Date(), revokedAt: null },
      });
    } else {
      await prisma.userLoginIdentifier.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          type: 'EMAIL',
          normalizedValue: demoEmail,
          verifiedAt: new Date(),
        },
      });
    }
    const activeBranchAssignment = await prisma.staffBranchAssignment.findFirst({
      where: {
        organizationId: organization.id,
        staffProfileId: staff.id,
        branchId: branch.id,
        endsAt: null,
      },
    });
    if (!activeBranchAssignment) {
      await prisma.staffBranchAssignment.create({
        data: { organizationId: organization.id, staffProfileId: staff.id, branchId: branch.id },
      });
    }
    const academicRoleId = roles.get('ACADEMIC')!;
    const activeRoleAssignment = await prisma.userRoleAssignment.findFirst({
      where: {
        organizationId: organization.id,
        userId: user.id,
        roleId: academicRoleId,
        endsAt: null,
      },
    });
    if (!activeRoleAssignment) {
      await prisma.userRoleAssignment.create({
        data: { organizationId: organization.id, userId: user.id, roleId: academicRoleId },
      });
    }
  }
}
seed()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
