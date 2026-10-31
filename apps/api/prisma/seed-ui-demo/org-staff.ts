import type { OrgAndStaffResult, SeedUiDemoContext } from './types';
export async function seedOrgAndStaff(ctx: SeedUiDemoContext): Promise<OrgAndStaffResult> {
  const { prisma } = ctx;
  const organizationCode =
    process.env.BOOTSTRAP_ORGANIZATION_CODE?.trim().toUpperCase() ?? 'ACADEMYOPS';
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { code: organizationCode },
  });
  const mainBranch = await prisma.branch.findUniqueOrThrow({
    where: { organizationId_code: { organizationId: organization.id, code: 'MAIN' } },
  });
  const eastBranch = await prisma.branch.upsert({
    where: { organizationId_code: { organizationId: organization.id, code: 'EAST' } },
    update: { name: 'Nasr City Branch', isActive: true },
    create: {
      organizationId: organization.id,
      code: 'EAST',
      name: 'Nasr City Branch',
    },
  });
  const demoIdentifier = await prisma.userLoginIdentifier.findFirstOrThrow({
    where: { organizationId: organization.id, type: 'EMAIL', revokedAt: null },
  });
  const demoUser = await prisma.user.findUniqueOrThrow({ where: { id: demoIdentifier.userId } });
  const staff = await prisma.staffProfile.findFirstOrThrow({
    where: { organizationId: organization.id, personId: demoUser.personId },
  });
  const secondAssignment = await prisma.staffBranchAssignment.findFirst({
    where: {
      organizationId: organization.id,
      staffProfileId: staff.id,
      branchId: eastBranch.id,
      endsAt: null,
    },
  });
  if (!secondAssignment) {
    await prisma.staffBranchAssignment.create({
      data: { organizationId: organization.id, staffProfileId: staff.id, branchId: eastBranch.id },
    });
  }
  const salesRole = await prisma.role.findFirstOrThrow({
    where: { organizationId: organization.id, code: 'SALES' },
  });
  const salesAssignment = await prisma.userRoleAssignment.findFirst({
    where: {
      organizationId: organization.id,
      userId: demoUser.id,
      roleId: salesRole.id,
      endsAt: null,
    },
  });
  if (!salesAssignment) {
    await prisma.userRoleAssignment.create({
      data: { organizationId: organization.id, userId: demoUser.id, roleId: salesRole.id },
    });
  }
  return {
    organization,
    mainBranch,
    eastBranch,
    demoUser,
  };
}
