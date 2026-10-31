import type { Branch, Organization } from '@prisma/client';
import type { AcademicResourcesResult, CohortWithDetails, SeedUiDemoContext } from './types';
import { monthsAgo } from './utils';
export async function seedAcademicResources(
  ctx: SeedUiDemoContext,
  input: {
    organization: Organization;
    mainBranch: Branch;
    eastBranch: Branch;
  },
): Promise<AcademicResourcesResult> {
  const { prisma } = ctx;
  const { organization, mainBranch, eastBranch } = input;
  const program = await prisma.program.upsert({
    where: { organizationId_code: { organizationId: organization.id, code: 'HR-DIPLOMA' } },
    update: {
      name: 'Human Resources Diploma',
      status: 'ACTIVE',
    },
    create: {
      organizationId: organization.id,
      code: 'HR-DIPLOMA',
      name: 'Human Resources Diploma',
    },
  });
  const version = await prisma.programVersion.upsert({
    where: {
      organizationId_programId_version: {
        organizationId: organization.id,
        programId: program.id,
        version: 1,
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      programId: program.id,
      version: 1,
      status: 'DRAFT',
      effectiveFrom: monthsAgo(8),
    },
  });
  const module = await prisma.academicModule.upsert({
    where: { organizationId_code: { organizationId: organization.id, code: 'HR-CORE' } },
    update: { name: 'HR Fundamentals' },
    create: {
      organizationId: organization.id,
      code: 'HR-CORE',
      name: 'HR Fundamentals',
    },
  });
  const versionModule = await prisma.programVersionModule.upsert({
    where: {
      organizationId_programVersionId_moduleId: {
        organizationId: organization.id,
        programVersionId: version.id,
        moduleId: module.id,
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      programVersionId: version.id,
      moduleId: module.id,
      ordinal: 1,
    },
  });
  if (version.status === 'DRAFT') {
    await prisma.programVersion.update({
      where: { id: version.id },
      data: { status: 'PUBLISHED' },
    });
    version.status = 'PUBLISHED';
  }
  const cohorts: CohortWithDetails[] = [];
  for (const [index, branch] of [mainBranch, eastBranch].entries()) {
    const cohort = await prisma.cohort.upsert({
      where: {
        organizationId_code: { organizationId: organization.id, code: `HR-DEMO-${index + 1}` },
      },
      update: { owningBranchId: branch.id },
      create: {
        organizationId: organization.id,
        programVersionId: version.id,
        owningBranchId: branch.id,
        code: `HR-DEMO-${index + 1}`,
        name: index === 0 ? 'مجموعة المساء' : 'مجموعة نهاية الأسبوع',
        status: 'DRAFT',
        startsOn: monthsAgo(2),
        capacity: 24,
      },
    });
    if (cohort.status === 'DRAFT') {
      await prisma.cohort.update({ where: { id: cohort.id }, data: { status: 'PLANNED' } });
      cohort.status = 'PLANNED';
    }
    if (cohort.status === 'PLANNED') {
      await prisma.cohort.update({ where: { id: cohort.id }, data: { status: 'ACTIVE' } });
      cohort.status = 'ACTIVE';
    }
    const cohortModule = await prisma.cohortModule.upsert({
      where: {
        organizationId_cohortId_programVersionModuleId: {
          organizationId: organization.id,
          cohortId: cohort.id,
          programVersionModuleId: versionModule.id,
        },
      },
      update: {},
      create: {
        organizationId: organization.id,
        cohortId: cohort.id,
        programVersionModuleId: versionModule.id,
        ordinal: 1,
      },
    });
    cohorts.push({ cohort, cohortModule, branch });
  }
  return {
    program,
    version,
    module,
    versionModule,
    cohorts,
  };
}
